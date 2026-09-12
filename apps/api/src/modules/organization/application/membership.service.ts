import { createEvent, type EventBus } from '../../../shared/events/event-bus';
import { pageWindow, type PageQueryInput } from '../../../shared/http/pagination';
import {
  MEMBER_REMOVED,
  MEMBER_UPDATED,
  type MemberRemovedEvent,
  type MemberUpdatedEvent,
} from '../domain/events';
import { hasPermission, type OrganizationActor } from '../domain/organization-context';
import { OrganizationErrors } from '../domain/organization-errors';
import type { Member, MemberChange, MembershipRepository } from '../domain/ports';
import { canAssignRole, canManageMember } from '../domain/role-hierarchy';

export class MembershipService {
  constructor(private readonly deps: { members: MembershipRepository; events: EventBus }) {}

  async list(
    actor: OrganizationActor,
    page: PageQueryInput,
  ): Promise<{ items: Member[]; total: number; page: number; limit: number }> {
    const { items, total } = await this.deps.members.listMembers(
      actor.organization.organizationId,
      pageWindow(page),
    );
    return { items, total, page: page.page, limit: page.limit };
  }

  /** Changes a member's role and/or status, respecting the role hierarchy and the last owner. */
  async update(
    actor: OrganizationActor,
    targetUserId: string,
    change: MemberChange,
  ): Promise<Member> {
    if (change.role && !hasPermission(actor.organization, 'member.role.update')) {
      throw OrganizationErrors.permissionDenied('member.role.update');
    }
    if (change.status && !hasPermission(actor.organization, 'member.remove')) {
      throw OrganizationErrors.permissionDenied('member.remove');
    }
    if (change.status === 'SUSPENDED' && targetUserId === actor.userId) {
      throw OrganizationErrors.cannotSuspendSelf();
    }

    const organizationId = actor.organization.organizationId;
    const { before, after } = await this.deps.members.runLocked(organizationId, async (members) => {
      const target = await members.find(targetUserId);
      if (!target) throw OrganizationErrors.memberNotFound();
      // Re-read the actor under the lock: their own role may have changed since the request began.
      const self = await members.find(actor.userId);
      if (!self || self.status !== 'ACTIVE') throw OrganizationErrors.notAMember();
      if (!canManageMember(self.roleKey, target.roleKey)) {
        throw OrganizationErrors.memberManagementForbidden();
      }
      if (change.role && !canAssignRole(self.roleKey, change.role)) {
        throw OrganizationErrors.roleAssignmentForbidden(change.role);
      }

      const losesOwnership =
        target.roleKey === 'OWNER' &&
        target.status === 'ACTIVE' &&
        ((change.role !== undefined && change.role !== 'OWNER') || change.status === 'SUSPENDED');
      if (losesOwnership && (await members.countActiveOwners()) <= 1) {
        throw OrganizationErrors.lastOwner();
      }

      return { before: target, after: await members.update(target.membershipId, change) };
    });

    const event: MemberUpdatedEvent = createEvent(MEMBER_UPDATED, {
      organization_id: organizationId,
      actor_id: actor.userId,
      subject_id: targetUserId,
      metadata: {
        previous_role: before.roleKey,
        role: after.roleKey,
        previous_status: before.status,
        status: after.status,
      },
    });
    await this.deps.events.publish(event);
    return after;
  }

  /** Removes a member. Removing yourself is leaving, which needs no permission. */
  async remove(actor: OrganizationActor, targetUserId: string): Promise<void> {
    const leaving = targetUserId === actor.userId;
    if (!leaving && !hasPermission(actor.organization, 'member.remove')) {
      throw OrganizationErrors.permissionDenied('member.remove');
    }

    const organizationId = actor.organization.organizationId;
    await this.deps.members.runLocked(organizationId, async (members) => {
      const target = await members.find(targetUserId);
      if (!target) throw OrganizationErrors.memberNotFound();
      if (!leaving) {
        const self = await members.find(actor.userId);
        if (!self || self.status !== 'ACTIVE' || !canManageMember(self.roleKey, target.roleKey)) {
          throw OrganizationErrors.memberManagementForbidden();
        }
      }
      if (
        target.roleKey === 'OWNER' &&
        target.status === 'ACTIVE' &&
        (await members.countActiveOwners()) <= 1
      ) {
        throw OrganizationErrors.lastOwner();
      }
      await members.remove(target.membershipId);
    });

    const event: MemberRemovedEvent = createEvent(MEMBER_REMOVED, {
      organization_id: organizationId,
      actor_id: actor.userId,
      subject_id: targetUserId,
      metadata: { left: leaving },
    });
    await this.deps.events.publish(event);
  }
}
