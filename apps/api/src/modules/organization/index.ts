import type { RequestHandler, Router } from 'express';
import type { Env } from '../../config/env';
import type { PrismaClient } from '../../generated/prisma/client';
import type { EventBus } from '../../shared/events/event-bus';
import {
  USER_REGISTERED,
  type ProfileVisibility,
  type UserDirectory,
  type UserRegisteredEvent,
} from '../identity';
import { DepartmentService } from './application/department.service';
import { InvitationService } from './application/invitation.service';
import { MembershipService } from './application/membership.service';
import { OrganizationManagementService } from './application/organization-management.service';
import { OrganizationService } from './application/organization.service';
import { PrismaDepartmentRepository } from './infrastructure/prisma-department.repository';
import { PrismaInvitationRepository } from './infrastructure/prisma-invitation.repository';
import { PrismaMembershipRepository } from './infrastructure/prisma-membership.repository';
import { PrismaOrganizationRepository } from './infrastructure/prisma-organization.repository';
import './presentation/openapi';
import { createRequireOrganization } from './presentation/require-organization';
import { createOrganizationRouter } from './presentation/routes';

// Public contract of the Organization module.
export {
  hasPermission,
  type OrganizationActor,
  type OrganizationContext,
} from './domain/organization-context';
export {
  PERMISSION_KEYS,
  SYSTEM_ROLES,
  type PermissionKey,
  type SystemRoleKey,
} from './domain/permissions';
export { organizationContext, requirePermission } from './presentation/require-organization';

export interface OrganizationModule {
  /** Plugged into Identity so profiles are only visible to co-members. */
  profileVisibility: ProfileVisibility;
  /** Resolves req.organization from the optional X-Organization-Id header; mount after requireAuth. */
  requireOrganization: RequestHandler;
  /**
   * Organization, member, invitation and department endpoints (mounted under /api/v1).
   * Built lazily because it needs Identity, which itself depends on profileVisibility.
   */
  createRouter(deps: { requireAuth: RequestHandler; users: UserDirectory }): Router;
}

export function createOrganizationModule(deps: {
  prisma: PrismaClient;
  events: EventBus;
  config: Pick<Env, 'DEFAULT_ORG_SLUG' | 'DEFAULT_ORG_NAME'>;
}): OrganizationModule {
  const { prisma, events, config } = deps;
  const organizations = new PrismaOrganizationRepository(prisma);
  const memberships = new PrismaMembershipRepository(prisma);
  const service = new OrganizationService({
    organizations,
    defaultOrganization: { slug: config.DEFAULT_ORG_SLUG, name: config.DEFAULT_ORG_NAME },
  });

  events.subscribe<UserRegisteredEvent>(USER_REGISTERED, async (event) => {
    if (event.subject_id) await service.joinDefaultOrganization(event.subject_id);
  });

  return {
    profileVisibility: {
      canView: (viewerId, targetId) => service.sharesOrganization(viewerId, targetId),
    },
    requireOrganization: createRequireOrganization(service, 'header'),
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
        }),
        users,
      }),
  };
}
