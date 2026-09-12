import { Router, type Request, type RequestHandler } from 'express';
import type { z } from 'zod';
import { PageQuery, toPagePagination, type PageQueryInput } from '../../../shared/http/pagination';
import { createRateLimiter } from '../../../shared/http/rate-limit';
import { created, ok, paginated } from '../../../shared/http/response';
import { validate } from '../../../shared/http/validate';
import { requireAuthContext, toUserReference, type UserDirectory } from '../../identity';
import type { DepartmentService } from '../application/department.service';
import type { InvitationService } from '../application/invitation.service';
import type { MembershipService } from '../application/membership.service';
import type { OrganizationManagementService } from '../application/organization-management.service';
import type { OrganizationActor } from '../domain/organization-context';
import type { Member } from '../domain/ports';
import {
  toDepartmentResponse,
  toInvitationResponse,
  toMemberResponse,
  toMyOrganizationResponse,
  toOrganizationDetailsResponse,
  toOrganizationResponse,
} from './dto';
import { organizationContext, requirePermission } from './require-organization';
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
  type AcceptInvitationInput,
  type CreateDepartmentInput,
  type CreateInvitationInput,
  type CreateOrganizationInput,
  type UpdateDepartmentInput,
  type UpdateMemberInput,
  type UpdateOrganizationInput,
} from './schemas';

type Params<T extends z.ZodType> = z.infer<T>;

/** Organization, member, invitation and department endpoints, mounted under /api/v1. */
export function createOrganizationRouter(deps: {
  requireAuth: RequestHandler;
  requireOrganizationFromPath: RequestHandler;
  management: OrganizationManagementService;
  memberships: MembershipService;
  invitations: InvitationService;
  departments: DepartmentService;
  users: UserDirectory;
}): Router {
  const { requireAuth, requireOrganizationFromPath, management, memberships, invitations } = deps;
  const { departments, users } = deps;

  const createLimiter = createRateLimiter({ windowMs: 60 * 60_000, limit: 10 });
  const inviteLimiter = createRateLimiter({ windowMs: 60 * 60_000, limit: 50 });
  const acceptLimiter = createRateLimiter({ windowMs: 15 * 60_000, limit: 20 });

  /** Authenticate, validate the path, then resolve the organization named in the path. */
  const inOrganization = (params: z.ZodType): RequestHandler[] => [
    requireAuth,
    validate({ params }),
    requireOrganizationFromPath,
  ];

  const actorOf = (req: Request): OrganizationActor => ({
    userId: requireAuthContext(req).userId,
    organization: organizationContext(req),
  });

  async function presentMembers(items: Member[]) {
    const directory = await users.getSummaries(items.map((member) => member.userId));
    return items.map((member) => toMemberResponse(member, directory));
  }

  // ─── Organizations ─────────────────────────────────────────────────────

  const listMine: RequestHandler = async (req, res) => {
    const organizations = await management.listMine(requireAuthContext(req).userId);
    ok(res, organizations.map(toMyOrganizationResponse));
  };

  const createOrganization: RequestHandler = async (req, res) => {
    const body = req.body as CreateOrganizationInput;
    const organization = await management.create(requireAuthContext(req).userId, body);
    created(
      res,
      toMyOrganizationResponse({
        ...organization,
        roleKey: 'OWNER',
        membershipStatus: 'ACTIVE',
        joinedAt: organization.createdAt,
      }),
    );
  };

  const getOrganization: RequestHandler = async (req, res) => {
    ok(res, toOrganizationDetailsResponse(await management.get(actorOf(req))));
  };

  const updateOrganization: RequestHandler = async (req, res) => {
    const body = req.body as UpdateOrganizationInput;
    const organization = await management.update(actorOf(req), {
      name: body.name,
      logoUrl: body.logo_url,
      timezone: body.timezone,
    });
    ok(res, toOrganizationResponse(organization));
  };

  // ─── Members ───────────────────────────────────────────────────────────

  const listMembers: RequestHandler = async (req, res) => {
    const page = await memberships.list(actorOf(req), req.query as unknown as PageQueryInput);
    paginated(res, await presentMembers(page.items), toPagePagination(page));
  };

  const updateMember: RequestHandler = async (req, res) => {
    const { userId } = req.params as Params<typeof MemberParams>;
    const body = req.body as UpdateMemberInput;
    const member = await memberships.update(actorOf(req), userId, body);
    const [response] = await presentMembers([member]);
    ok(res, response);
  };

  const removeMember: RequestHandler = async (req, res) => {
    const { userId } = req.params as Params<typeof MemberParams>;
    await memberships.remove(actorOf(req), userId);
    ok(res, { user_id: userId, removed: true });
  };

  // ─── Invitations ───────────────────────────────────────────────────────

  const listInvitations: RequestHandler = async (req, res) => {
    const pending = await invitations.list(actorOf(req));
    ok(
      res,
      pending.map((invitation) => toInvitationResponse(invitation)),
    );
  };

  const invite: RequestHandler = async (req, res) => {
    const body = req.body as CreateInvitationInput;
    const { invitation, token } = await invitations.invite(actorOf(req), body);
    created(res, { ...toInvitationResponse(invitation), token });
  };

  const revokeInvitation: RequestHandler = async (req, res) => {
    const { invitationId } = req.params as Params<typeof InvitationParams>;
    await invitations.revoke(actorOf(req), invitationId);
    ok(res, { id: invitationId, revoked: true });
  };

  const acceptInvitation: RequestHandler = async (req, res) => {
    const body = req.body as AcceptInvitationInput;
    const result = await invitations.accept(requireAuthContext(req).userId, body.token);
    ok(res, { organization_id: result.organizationId, role: result.roleKey });
  };

  // ─── Departments ───────────────────────────────────────────────────────

  const listDepartments: RequestHandler = async (req, res) => {
    ok(res, (await departments.list(actorOf(req))).map(toDepartmentResponse));
  };

  const createDepartment: RequestHandler = async (req, res) => {
    const body = req.body as CreateDepartmentInput;
    created(res, toDepartmentResponse(await departments.create(actorOf(req), body)));
  };

  const updateDepartment: RequestHandler = async (req, res) => {
    const { departmentId } = req.params as Params<typeof DepartmentParams>;
    const body = req.body as UpdateDepartmentInput;
    ok(res, toDepartmentResponse(await departments.update(actorOf(req), departmentId, body)));
  };

  const deleteDepartment: RequestHandler = async (req, res) => {
    const { departmentId } = req.params as Params<typeof DepartmentParams>;
    await departments.delete(actorOf(req), departmentId);
    ok(res, { id: departmentId, deleted: true });
  };

  const listDepartmentMembers: RequestHandler = async (req, res) => {
    const { departmentId } = req.params as Params<typeof DepartmentParams>;
    const ids = await departments.listMemberIds(actorOf(req), departmentId);
    const directory = await users.getSummaries(ids);
    ok(
      res,
      ids.map((id) => toUserReference(directory.get(id))),
    );
  };

  const addDepartmentMember: RequestHandler = async (req, res) => {
    const { departmentId, userId } = req.params as Params<typeof DepartmentMemberParams>;
    await departments.addMember(actorOf(req), departmentId, userId);
    ok(res, { department_id: departmentId, user_id: userId });
  };

  const removeDepartmentMember: RequestHandler = async (req, res) => {
    const { departmentId, userId } = req.params as Params<typeof DepartmentMemberParams>;
    await departments.removeMember(actorOf(req), departmentId, userId);
    ok(res, { department_id: departmentId, user_id: userId });
  };

  const router = Router();
  const org = '/organizations/:organizationId';

  router.get('/organizations', requireAuth, listMine);
  router.post(
    '/organizations',
    createLimiter,
    requireAuth,
    validate({ body: CreateOrganizationBody }),
    createOrganization,
  );
  router.get(org, ...inOrganization(OrganizationParams), getOrganization);
  router.put(
    org,
    ...inOrganization(OrganizationParams),
    requirePermission('organization.update'),
    validate({ body: UpdateOrganizationBody }),
    updateOrganization,
  );

  router.get(
    `${org}/members`,
    ...inOrganization(OrganizationParams),
    validate({ query: PageQuery }),
    listMembers,
  );
  router.patch(
    `${org}/members/:userId`,
    ...inOrganization(MemberParams),
    validate({ body: UpdateMemberBody }),
    updateMember,
  );
  router.delete(`${org}/members/:userId`, ...inOrganization(MemberParams), removeMember);

  router.get(
    `${org}/invitations`,
    ...inOrganization(OrganizationParams),
    requirePermission('member.invite'),
    listInvitations,
  );
  router.post(
    `${org}/invitations`,
    inviteLimiter,
    ...inOrganization(OrganizationParams),
    requirePermission('member.invite'),
    validate({ body: CreateInvitationBody }),
    invite,
  );
  router.delete(
    `${org}/invitations/:invitationId`,
    ...inOrganization(InvitationParams),
    requirePermission('member.invite'),
    revokeInvitation,
  );
  router.post(
    '/invitations/accept',
    acceptLimiter,
    requireAuth,
    validate({ body: AcceptInvitationBody }),
    acceptInvitation,
  );

  router.get(`${org}/departments`, ...inOrganization(OrganizationParams), listDepartments);
  router.post(
    `${org}/departments`,
    ...inOrganization(OrganizationParams),
    requirePermission('department.manage'),
    validate({ body: CreateDepartmentBody }),
    createDepartment,
  );
  router.put(
    `${org}/departments/:departmentId`,
    ...inOrganization(DepartmentParams),
    requirePermission('department.manage'),
    validate({ body: UpdateDepartmentBody }),
    updateDepartment,
  );
  router.delete(
    `${org}/departments/:departmentId`,
    ...inOrganization(DepartmentParams),
    requirePermission('department.manage'),
    deleteDepartment,
  );
  router.get(
    `${org}/departments/:departmentId/members`,
    ...inOrganization(DepartmentParams),
    listDepartmentMembers,
  );
  router.put(
    `${org}/departments/:departmentId/members/:userId`,
    ...inOrganization(DepartmentMemberParams),
    requirePermission('department.manage'),
    addDepartmentMember,
  );
  router.delete(
    `${org}/departments/:departmentId/members/:userId`,
    ...inOrganization(DepartmentMemberParams),
    requirePermission('department.manage'),
    removeDepartmentMember,
  );

  return router;
}
