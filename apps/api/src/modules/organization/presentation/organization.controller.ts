import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { toPagePagination } from '../../../shared/http/pagination';
import { created, ok, paginated } from '../../../shared/http/response';
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
import { organizationContext } from './require-organization';
import type {
  AcceptInvitationInput,
  CreateDepartmentInput,
  CreateInvitationInput,
  CreateOrganizationInput,
  DepartmentMemberParams,
  DepartmentParams,
  InvitationParams,
  MemberParams,
  UpdateDepartmentInput,
  UpdateMemberInput,
  UpdateOrganizationInput,
  MemberListQueryInput,
} from './schemas';

type Params<T extends z.ZodType> = z.infer<T>;

/**
 * Handlers for organizations, members, invitations and departments: read the request, call the
 * services, shape the response. Paths, rate limits, validation and permissions are in routes.ts.
 */
export function createOrganizationController(deps: {
  management: OrganizationManagementService;
  memberships: MembershipService;
  invitations: InvitationService;
  departments: DepartmentService;
  users: UserDirectory;
}) {
  const { management, memberships, invitations, departments, users } = deps;

  const actorOf = (req: Request): OrganizationActor => ({
    userId: requireAuthContext(req).userId,
    organization: organizationContext(req),
  });

  async function presentMembers(actor: OrganizationActor, items: Member[]) {
    const ids = items.map((member) => member.userId);
    const [directory, placed] = await Promise.all([
      users.getSummaries(ids),
      departments.departmentsOf(actor, ids),
    ]);
    return items.map((member) => toMemberResponse(member, directory, placed));
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
    const { department_id: departmentId, ...query } = req.query as unknown as MemberListQueryInput;
    const page = await memberships.list(actorOf(req), { ...query, departmentId });
    paginated(res, await presentMembers(actorOf(req), page.items), toPagePagination(page));
  };

  const getMember: RequestHandler = async (req, res) => {
    const { userId } = req.params as Params<typeof MemberParams>;
    const actor = actorOf(req);
    const [response] = await presentMembers(actor, [await memberships.get(actor, userId)]);
    ok(res, response);
  };

  const updateMember: RequestHandler = async (req, res) => {
    const { userId } = req.params as Params<typeof MemberParams>;
    const body = req.body as UpdateMemberInput;
    const actor = actorOf(req);
    const member = await memberships.update(actor, userId, body);
    const [response] = await presentMembers(actor, [member]);
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

  return {
    listMine,
    createOrganization,
    getOrganization,
    updateOrganization,
    listMembers,
    getMember,
    updateMember,
    removeMember,
    listInvitations,
    invite,
    revokeInvitation,
    acceptInvitation,
    listDepartments,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    listDepartmentMembers,
    addDepartmentMember,
    removeDepartmentMember,
  };
}
