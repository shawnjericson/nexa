import { createEvent, type EventBus } from '../../../shared/events/event-bus';
import { generateOpaqueToken, sha256Hex } from '../../../shared/utils/tokens';
import type { UserDirectory } from '../../identity';
import {
  MEMBER_INVITED,
  MEMBER_JOINED,
  type MemberInvitedEvent,
  type MemberJoinedEvent,
} from '../domain/events';
import { invitationState, type Invitation } from '../domain/invitation';
import type { OrganizationActor } from '../domain/organization-context';
import { OrganizationErrors } from '../domain/organization-errors';
import type { SystemRoleKey } from '../domain/permissions';
import type { InvitationRepository, MembershipRepository } from '../domain/ports';
import { canAssignRole } from '../domain/role-hierarchy';

const DAY_MS = 86_400_000;

export class InvitationService {
  private readonly now: () => Date;
  private readonly ttlDays: number;

  constructor(
    private readonly deps: {
      invitations: InvitationRepository;
      members: MembershipRepository;
      users: UserDirectory;
      events: EventBus;
      ttlDays?: number;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
    this.ttlDays = deps.ttlDays ?? 7;
  }

  /**
   * Creates an invitation and returns its token once (only the hash is stored). Inviting the same
   * email again replaces the pending invitation, which is also how an expired one is renewed.
   */
  async invite(
    actor: OrganizationActor,
    input: { email: string; role: SystemRoleKey },
  ): Promise<{ invitation: Invitation; token: string }> {
    if (!canAssignRole(actor.organization.roleKey, input.role)) {
      throw OrganizationErrors.roleAssignmentForbidden(input.role);
    }

    const organizationId = actor.organization.organizationId;
    const existingUser = await this.deps.users.findByEmail(input.email);
    if (existingUser && (await this.deps.members.findMember(organizationId, existingUser.id))) {
      throw OrganizationErrors.alreadyMember();
    }

    const now = this.now();
    const { token, hash } = generateOpaqueToken();
    const invitation = await this.deps.invitations.replacePending(
      {
        organizationId,
        email: input.email,
        roleKey: input.role,
        tokenHash: hash,
        invitedById: actor.userId,
        expiresAt: new Date(now.getTime() + this.ttlDays * DAY_MS),
      },
      now,
    );

    const event: MemberInvitedEvent = createEvent(MEMBER_INVITED, {
      organization_id: organizationId,
      actor_id: actor.userId,
      subject_id: invitation.id,
      metadata: { invitation_id: invitation.id, email: invitation.email, role: input.role },
    });
    await this.deps.events.publish(event);
    return { invitation, token };
  }

  list(actor: OrganizationActor): Promise<Invitation[]> {
    return this.deps.invitations.listPending(actor.organization.organizationId, this.now());
  }

  async revoke(actor: OrganizationActor, invitationId: string): Promise<void> {
    const revoked = await this.deps.invitations.revoke(
      actor.organization.organizationId,
      invitationId,
      this.now(),
    );
    if (!revoked) throw OrganizationErrors.invitationNotFound();
  }

  /** Joins the organization with the invited role (risk register 6: expired / reused invitations). */
  async accept(
    userId: string,
    token: string,
  ): Promise<{ organizationId: string; roleKey: string }> {
    const now = this.now();
    const invitation = await this.deps.invitations.findByTokenHash(sha256Hex(token));
    if (!invitation) throw OrganizationErrors.invitationNotFound();

    const state = invitationState(invitation, now);
    if (state === 'ACCEPTED') throw OrganizationErrors.invitationAlreadyUsed();
    if (state === 'REVOKED') throw OrganizationErrors.invitationRevoked();
    if (state === 'EXPIRED') throw OrganizationErrors.invitationExpired();

    // The link is bound to the invited address, so a leaked link is useless to anyone else.
    const user = (await this.deps.users.getSummaries([userId])).get(userId);
    if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw OrganizationErrors.invitationEmailMismatch();
    }

    const outcome = await this.deps.invitations.accept(invitation.id, userId, now);
    if (outcome === 'ALREADY_MEMBER') throw OrganizationErrors.alreadyMember();
    if (outcome === 'UNAVAILABLE') throw OrganizationErrors.invitationAlreadyUsed();

    const event: MemberJoinedEvent = createEvent(MEMBER_JOINED, {
      organization_id: invitation.organizationId,
      actor_id: userId,
      subject_id: userId,
      metadata: { role: invitation.roleKey, via: 'invitation' },
    });
    await this.deps.events.publish(event);
    return { organizationId: invitation.organizationId, roleKey: invitation.roleKey };
  }
}
