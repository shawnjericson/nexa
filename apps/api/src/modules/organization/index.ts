import type { RequestHandler } from 'express';
import type { Env } from '../../config/env';
import type { PrismaClient } from '../../generated/prisma/client';
import type { EventBus } from '../../shared/events/event-bus';
import { USER_REGISTERED, type ProfileVisibility, type UserRegisteredEvent } from '../identity';
import { OrganizationService } from './application/organization.service';
import { PrismaOrganizationRepository } from './infrastructure/prisma-organization.repository';
import { createRequireOrganization } from './presentation/require-organization';

// Public contract of the Organization module.
export { hasPermission, type OrganizationContext } from './domain/organization-context';
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
  /** Resolves req.organization; mount after requireAuth. */
  requireOrganization: RequestHandler;
}

export function createOrganizationModule(deps: {
  prisma: PrismaClient;
  events: EventBus;
  config: Pick<Env, 'DEFAULT_ORG_SLUG' | 'DEFAULT_ORG_NAME'>;
}): OrganizationModule {
  const service = new OrganizationService({
    organizations: new PrismaOrganizationRepository(deps.prisma),
    defaultOrganization: { slug: deps.config.DEFAULT_ORG_SLUG, name: deps.config.DEFAULT_ORG_NAME },
  });

  deps.events.subscribe<UserRegisteredEvent>(USER_REGISTERED, async (event) => {
    if (event.subject_id) await service.joinDefaultOrganization(event.subject_id);
  });

  return {
    profileVisibility: {
      canView: (viewerId, targetId) => service.sharesOrganization(viewerId, targetId),
    },
    requireOrganization: createRequireOrganization(service),
  };
}
