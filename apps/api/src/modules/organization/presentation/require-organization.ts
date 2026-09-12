import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import { requireAuthContext } from '../../identity';
import type { OrganizationService } from '../application/organization.service';
import { hasPermission, type OrganizationContext } from '../domain/organization-context';
import { OrganizationErrors } from '../domain/organization-errors';
import type { PermissionKey } from '../domain/permissions';

const OrganizationId = z.uuid();

/**
 * Runs after requireAuth. The membership is loaded on every request, so removals, suspensions
 * and role changes apply immediately even while an access token is still valid
 * (risk register 4.3 and 4.4). The organization_id used by handlers always comes from here,
 * never from the request body (spec section 15).
 *
 * - source "header": optional X-Organization-Id (social routes)
 * - source "path":   the :organizationId route parameter (organization management routes)
 */
export function createRequireOrganization(
  service: OrganizationService,
  source: 'header' | 'path' = 'header',
): RequestHandler {
  return async (req, _res, next) => {
    const { userId } = requireAuthContext(req);
    const requested =
      source === 'path'
        ? (req.params as { organizationId?: string }).organizationId
        : req.get('x-organization-id')?.trim() || undefined;
    if (source === 'path' && !requested) {
      throw new Error('Route is missing the :organizationId parameter');
    }
    if (requested !== undefined && !OrganizationId.safeParse(requested).success) {
      throw OrganizationErrors.invalidOrganizationId();
    }

    req.organization = await service.resolveContext(userId, requested);
    next();
  };
}

export function organizationContext(req: Request): OrganizationContext {
  if (!req.organization) {
    throw new Error('requireOrganization middleware is missing on this route');
  }
  return req.organization;
}

export function requirePermission(permission: PermissionKey): RequestHandler {
  return (req, _res, next) => {
    if (!hasPermission(organizationContext(req), permission)) {
      throw OrganizationErrors.permissionDenied(permission);
    }
    next();
  };
}
