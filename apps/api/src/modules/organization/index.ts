import type { RequestHandler, Router } from 'express';
import type { Env } from '../../config/env';
import type { PrismaClient } from '../../generated/prisma/client';
import { createEvent, type EventBus } from '../../shared/events/event-bus';
import {
  GUEST_CREATED,
  USER_REGISTERED,
  type GuestCreatedEvent,
  type ProfileVisibility,
  type UserDirectory,
  type UserRegisteredEvent,
} from '../identity';
import { MEMBER_JOINED, type MemberJoinedEvent } from './domain/events';
import { DepartmentService } from './application/department.service';
import { InvitationService } from './application/invitation.service';
import { MembershipService } from './application/membership.service';
import { OrganizationManagementService } from './application/organization-management.service';
import { OrganizationService } from './application/organization.service';
import type { OrganizationContext } from './domain/organization-context';
import type { OrganizationDirectory } from './domain/organization-directory';
import { PrismaDepartmentRepository } from './infrastructure/prisma-department.repository';
import { PrismaInvitationRepository } from './infrastructure/prisma-invitation.repository';
import { PrismaMembershipRepository } from './infrastructure/prisma-membership.repository';
import { PrismaOrganizationDirectory } from './infrastructure/prisma-organization-directory';
import { PrismaOrganizationRepository } from './infrastructure/prisma-organization.repository';
import './presentation/openapi';
import { createRequireOrganization } from './presentation/require-organization';
import { createOrganizationRouter } from './presentation/routes';

// Public contract of the Organization module.
export {
  DEPARTMENT_CREATED,
  DEPARTMENT_DELETED,
  MEMBER_INVITED,
  MEMBER_JOINED,
  MEMBER_REMOVED,
  MEMBER_UPDATED,
  ORGANIZATION_CREATED,
  ORGANIZATION_UPDATED,
  type MemberJoinedEvent,
  type MemberUpdatedEvent,
} from './domain/events';
export {
  hasPermission,
  type OrganizationActor,
  type OrganizationContext,
} from './domain/organization-context';
export type { OrganizationDirectory } from './domain/organization-directory';
export {
  PERMISSION_KEYS,
  SYSTEM_ROLES,
  type PermissionKey,
  type SystemRoleKey,
} from './domain/permissions';
export { organizationContext, requirePermission } from './presentation/require-organization';

export type ResolveOrganizationContext = (
  userId: string,
  organizationId?: string,
) => Promise<OrganizationContext>;

export interface OrganizationModule {
  /** Plugged into Identity so profiles are only visible to co-members. */
  profileVisibility: ProfileVisibility;
  /** Resolves req.organization from the optional X-Organization-Id header; mount after requireAuth. */
  requireOrganization: RequestHandler;
  /** Same resolution as requireOrganization, for non-HTTP transports (WebSocket handshakes). */
  resolveContext: ResolveOrganizationContext;
  directory: OrganizationDirectory;
  /**
   * Organization, member, invitation and department endpoints (mounted under /api/v1).
   * Built lazily because it needs Identity, which itself depends on profileVisibility.
   */
  createRouter(deps: { requireAuth: RequestHandler; users: UserDirectory }): Router;
}

export function createOrganizationModule(deps: {
  prisma: PrismaClient;
  events: EventBus;
  config: Pick<Env, 'DEFAULT_ORG_SLUG' | 'DEFAULT_ORG_NAME' | 'SIGNUP_MODE' | 'DEMO_ORG_SLUG'>;
}): OrganizationModule {
  const { prisma, events, config } = deps;
  const organizations = new PrismaOrganizationRepository(prisma);
  const memberships = new PrismaMembershipRepository(prisma);
  const service = new OrganizationService({
    organizations,
    defaultOrganization: { slug: config.DEFAULT_ORG_SLUG, name: config.DEFAULT_ORG_NAME },
  });

  // A demo visitor goes straight into the demo, and only ever as a plain member - never as the
  // owner of an organization that happened to be empty.
  const demoSlug = config.DEMO_ORG_SLUG;
  if (demoSlug) {
    events.subscribe<GuestCreatedEvent>(GUEST_CREATED, async (event) => {
      if (!event.subject_id) return;
      const demo = await organizations.ensureOrganization({ slug: demoSlug, name: 'NEXA Demo' });
      await organizations.addMember(demo.id, event.subject_id, {
        firstMember: 'MEMBER',
        others: 'MEMBER',
      });
      // Other modules furnish the visit - chat seats the guest in the demo's channels.
      const joined: MemberJoinedEvent = createEvent(MEMBER_JOINED, {
        organization_id: demo.id,
        actor_id: event.subject_id,
        subject_id: event.subject_id,
        metadata: { role: 'MEMBER', via: 'demo' },
      });
      await events.publish(joined);
    });
  }

  // Under "invite", registering gets you an account and nothing else: an invitation, bound to
  // your e-mail address, is what puts you inside an organization.
  if (config.SIGNUP_MODE === 'open') {
    events.subscribe<UserRegisteredEvent>(USER_REGISTERED, async (event) => {
      if (event.subject_id) await service.joinDefaultOrganization(event.subject_id);
    });
  }

  return {
    profileVisibility: {
      canView: (viewerId, targetId) => service.sharesOrganization(viewerId, targetId),
    },
    requireOrganization: createRequireOrganization(service, 'header'),
    resolveContext: (userId, organizationId) => service.resolveContext(userId, organizationId),
    directory: new PrismaOrganizationDirectory(prisma),
    createRouter: ({ requireAuth, users }) =>
      createOrganizationRouter({
        requireAuth,
        requireOrganizationFromPath: createRequireOrganization(service, 'path'),
        management: new OrganizationManagementService({ organizations, events }),
        memberships: new MembershipService({ members: memberships, events }),
        invitations: new InvitationService({
          invitations: new PrismaInvitationRepository(prisma),
          members: memberships,
          users,
          events,
        }),
        departments: new DepartmentService({
          departments: new PrismaDepartmentRepository(prisma),
          members: memberships,
          events,
        }),
        users,
      }),
  };
}
