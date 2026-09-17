import { Router, type RequestHandler } from 'express';
import type { z } from 'zod';
import { PageQuery } from '../../../shared/http/pagination';
import { createRateLimiter } from '../../../shared/http/rate-limit';
import { validate } from '../../../shared/http/validate';
import type { UserDirectory } from '../../identity';
import type { DepartmentService } from '../application/department.service';
import type { InvitationService } from '../application/invitation.service';
import type { MembershipService } from '../application/membership.service';
import type { OrganizationManagementService } from '../application/organization-management.service';
import { createOrganizationController } from './organization.controller';
import { requirePermission } from './require-organization';
import {
  AcceptInvitationBody,
  CreateDepartmentBody,
  CreateInvitationBody,
  CreateOrganizationBody,
  DepartmentMemberParams,
  DepartmentParams,
  InvitationParams,
  MemberParams,
  OrganizationParams,
  UpdateDepartmentBody,
  UpdateMemberBody,
  UpdateOrganizationBody,
} from './schemas';

/**
 * Organization, member, invitation and department endpoints, mounted under /api/v1. The handlers
 * are in organization.controller.ts.
 */
export function createOrganizationRouter(deps: {
  requireAuth: RequestHandler;
  requireOrganizationFromPath: RequestHandler;
  management: OrganizationManagementService;
  memberships: MembershipService;
  invitations: InvitationService;
  departments: DepartmentService;
  users: UserDirectory;
}): Router {
  const { requireAuth, requireOrganizationFromPath } = deps;
  const controller = createOrganizationController(deps);

  const createLimiter = createRateLimiter({ windowMs: 60 * 60_000, limit: 10 });
  const inviteLimiter = createRateLimiter({ windowMs: 60 * 60_000, limit: 50 });
  const acceptLimiter = createRateLimiter({ windowMs: 15 * 60_000, limit: 20 });

  /** Authenticate, validate the path, then resolve the organization named in the path. */
  const inOrganization = (params: z.ZodType): RequestHandler[] => [
    requireAuth,
    validate({ params }),
    requireOrganizationFromPath,
  ];

  const router = Router();
  const org = '/organizations/:organizationId';

  router.get('/organizations', requireAuth, controller.listMine);
  router.post(
    '/organizations',
    createLimiter,
    requireAuth,
    validate({ body: CreateOrganizationBody }),
    controller.createOrganization,
  );
  router.get(org, ...inOrganization(OrganizationParams), controller.getOrganization);
  router.put(
    org,
    ...inOrganization(OrganizationParams),
    requirePermission('organization.update'),
    validate({ body: UpdateOrganizationBody }),
    controller.updateOrganization,
  );

  router.get(
    `${org}/members`,
    ...inOrganization(OrganizationParams),
    validate({ query: PageQuery }),
    controller.listMembers,
  );
  router.patch(
    `${org}/members/:userId`,
    ...inOrganization(MemberParams),
    validate({ body: UpdateMemberBody }),
    controller.updateMember,
  );
  router.delete(`${org}/members/:userId`, ...inOrganization(MemberParams), controller.removeMember);

  router.get(
    `${org}/invitations`,
    ...inOrganization(OrganizationParams),
    requirePermission('member.invite'),
    controller.listInvitations,
  );
  router.post(
    `${org}/invitations`,
    inviteLimiter,
    ...inOrganization(OrganizationParams),
    requirePermission('member.invite'),
    validate({ body: CreateInvitationBody }),
    controller.invite,
  );
  router.delete(
    `${org}/invitations/:invitationId`,
    ...inOrganization(InvitationParams),
    requirePermission('member.invite'),
    controller.revokeInvitation,
  );
  router.post(
    '/invitations/accept',
    acceptLimiter,
    requireAuth,
    validate({ body: AcceptInvitationBody }),
    controller.acceptInvitation,
  );

  router.get(
    `${org}/departments`,
    ...inOrganization(OrganizationParams),
    controller.listDepartments,
  );
  router.post(
    `${org}/departments`,
    ...inOrganization(OrganizationParams),
    requirePermission('department.manage'),
    validate({ body: CreateDepartmentBody }),
    controller.createDepartment,
  );
  router.put(
    `${org}/departments/:departmentId`,
    ...inOrganization(DepartmentParams),
    requirePermission('department.manage'),
    validate({ body: UpdateDepartmentBody }),
    controller.updateDepartment,
  );
  router.delete(
    `${org}/departments/:departmentId`,
    ...inOrganization(DepartmentParams),
    requirePermission('department.manage'),
    controller.deleteDepartment,
  );
  router.get(
    `${org}/departments/:departmentId/members`,
    ...inOrganization(DepartmentParams),
    controller.listDepartmentMembers,
  );
  router.put(
    `${org}/departments/:departmentId/members/:userId`,
    ...inOrganization(DepartmentMemberParams),
    requirePermission('department.manage'),
    controller.addDepartmentMember,
  );
  router.delete(
    `${org}/departments/:departmentId/members/:userId`,
    ...inOrganization(DepartmentMemberParams),
    requirePermission('department.manage'),
    controller.removeDepartmentMember,
  );

  return router;
}
