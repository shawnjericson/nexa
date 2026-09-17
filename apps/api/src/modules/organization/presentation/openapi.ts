import { z } from 'zod';
import {
  bearerAuth,
  errorResponses,
  jsonContent,
  paginatedResponse,
  registry,
  successResponse,
} from '../../../shared/http/openapi';
import { PagePagination } from '../../../shared/http/pagination';
import { UserReference } from '../../identity';
import {
  AcceptedInvitation,
  AcceptInvitationBody,
  CreateDepartmentBody,
  CreatedInvitation,
  CreateInvitationBody,
  CreateOrganizationBody,
  DepartmentMemberParams,
  DepartmentParams,
  DepartmentResponse,
  InvitationParams,
  InvitationResponse,
  MemberParams,
  MemberResponse,
  MyOrganization,
  OrganizationDetails,
  OrganizationParams,
  OrganizationResponse,
  UpdateDepartmentBody,
  UpdateMemberBody,
  UpdateOrganizationBody,
  MemberListQuery,
} from './schemas';

type RouteConfig = Parameters<typeof registry.registerPath>[0];
type RequestConfig = NonNullable<RouteConfig['request']>;

function route(config: {
  method: RouteConfig['method'];
  path: string;
  summary: string;
  description?: string;
  tag: string;
  params?: RequestConfig['params'];
  query?: RequestConfig['query'];
  body?: z.ZodType;
  status?: number;
  /** Full response body schema. */
  response: z.ZodType;
  errors: number[];
}) {
  const { method, path, summary, description, tag, params, query, body, response, errors } = config;
  registry.registerPath({
    method,
    path,
    summary,
    description,
    tags: [tag],
    security: bearerAuth,
    request: {
      ...(params && { params }),
      ...(query && { query }),
      ...(body && { body: { content: jsonContent(body) } }),
    },
    responses: {
      [config.status ?? 200]: { description: summary, content: jsonContent(response) },
      ...errorResponses(...errors),
    },
  });
}

const org = '/api/v1/organizations/{organizationId}';
const ORG = 'Organizations';
const MEMBERS = 'Members';
const INVITES = 'Invitations';
const DEPTS = 'Departments';

route({
  method: 'get',
  path: '/api/v1/organizations',
  tag: ORG,
  summary: 'Organizations you belong to, with your role',
  response: successResponse(z.array(MyOrganization)),
  errors: [401],
});
route({
  method: 'post',
  path: '/api/v1/organizations',
  tag: ORG,
  summary: 'Create an organization; you become its OWNER',
  body: CreateOrganizationBody,
  status: 201,
  response: successResponse(MyOrganization),
  errors: [400, 401, 409, 429],
});
route({
  method: 'get',
  path: org,
  tag: ORG,
  summary: 'Organization details (members only)',
  params: OrganizationParams,
  response: successResponse(OrganizationDetails),
  errors: [400, 401, 403],
});
route({
  method: 'put',
  path: org,
  tag: ORG,
  summary: 'Update the organization (organization.update)',
  params: OrganizationParams,
  body: UpdateOrganizationBody,
  response: successResponse(OrganizationResponse),
  errors: [400, 401, 403],
});

route({
  method: 'get',
  path: `${org}/members`,
  tag: MEMBERS,
  summary: 'Members with their role and status',
  description: 'Searched, filtered by department and sorted in the database, one page at a time.',
  params: OrganizationParams,
  query: MemberListQuery,
  response: paginatedResponse(MemberResponse, PagePagination),
  errors: [400, 401, 403],
});
route({
  method: 'get',
  path: `${org}/members/{userId}`,
  tag: MEMBERS,
  summary: 'One member, with their role and status',
  params: MemberParams,
  response: successResponse(MemberResponse),
  errors: [400, 401, 403, 404],
});
route({
  method: 'patch',
  path: `${org}/members/{userId}`,
  tag: MEMBERS,
  summary: 'Change role (member.role.update) or status (member.remove)',
  description:
    'Role hierarchy: you can only manage members ranked below you and grant roles below your own; ' +
    'only OWNERs grant OWNER. The last active OWNER can never be demoted or suspended.',
  params: MemberParams,
  body: UpdateMemberBody,
  response: successResponse(MemberResponse),
  errors: [400, 401, 403, 404, 409],
});
route({
  method: 'delete',
  path: `${org}/members/{userId}`,
  tag: MEMBERS,
  summary: 'Remove a member (member.remove), or leave when it is you',
  params: MemberParams,
  response: successResponse(z.object({ user_id: z.uuid(), removed: z.literal(true) })),
  errors: [400, 401, 403, 404, 409],
});

route({
  method: 'get',
  path: `${org}/invitations`,
  tag: INVITES,
  summary: 'Pending invitations (member.invite)',
  params: OrganizationParams,
  response: successResponse(z.array(InvitationResponse)),
  errors: [400, 401, 403],
});
route({
  method: 'post',
  path: `${org}/invitations`,
  tag: INVITES,
  summary: 'Invite someone by email (member.invite)',
  description:
    'Returns the invitation token once. Inviting the same email again replaces the pending ' +
    'invitation. Invitations expire after 7 days.',
  params: OrganizationParams,
  body: CreateInvitationBody,
  status: 201,
  response: successResponse(CreatedInvitation),
  errors: [400, 401, 403, 409, 429],
});
route({
  method: 'delete',
  path: `${org}/invitations/{invitationId}`,
  tag: INVITES,
  summary: 'Revoke a pending invitation (member.invite)',
  params: InvitationParams,
  response: successResponse(z.object({ id: z.uuid(), revoked: z.literal(true) })),
  errors: [400, 401, 403, 404],
});
route({
  method: 'post',
  path: '/api/v1/invitations/accept',
  tag: INVITES,
  summary: 'Accept an invitation sent to your email address',
  body: AcceptInvitationBody,
  response: successResponse(AcceptedInvitation),
  errors: [400, 401, 403, 404, 409, 410, 429],
});

route({
  method: 'get',
  path: `${org}/departments`,
  tag: DEPTS,
  summary: 'Departments with member counts',
  params: OrganizationParams,
  response: successResponse(z.array(DepartmentResponse)),
  errors: [400, 401, 403],
});
route({
  method: 'post',
  path: `${org}/departments`,
  tag: DEPTS,
  summary: 'Create a department (department.manage)',
  params: OrganizationParams,
  body: CreateDepartmentBody,
  status: 201,
  response: successResponse(DepartmentResponse),
  errors: [400, 401, 403, 409],
});
route({
  method: 'put',
  path: `${org}/departments/{departmentId}`,
  tag: DEPTS,
  summary: 'Rename or describe a department (department.manage)',
  params: DepartmentParams,
  body: UpdateDepartmentBody,
  response: successResponse(DepartmentResponse),
  errors: [400, 401, 403, 404, 409],
});
route({
  method: 'delete',
  path: `${org}/departments/{departmentId}`,
  tag: DEPTS,
  summary: 'Delete a department; its members simply leave it (department.manage)',
  params: DepartmentParams,
  response: successResponse(z.object({ id: z.uuid(), deleted: z.literal(true) })),
  errors: [400, 401, 403, 404],
});
route({
  method: 'get',
  path: `${org}/departments/{departmentId}/members`,
  tag: DEPTS,
  summary: 'People in a department',
  params: DepartmentParams,
  response: successResponse(z.array(UserReference.nullable())),
  errors: [400, 401, 403, 404],
});
route({
  method: 'put',
  path: `${org}/departments/{departmentId}/members/{userId}`,
  tag: DEPTS,
  summary: 'Add a member to a department (idempotent, department.manage)',
  params: DepartmentMemberParams,
  response: successResponse(z.object({ department_id: z.uuid(), user_id: z.uuid() })),
  errors: [400, 401, 403, 404],
});
route({
  method: 'delete',
  path: `${org}/departments/{departmentId}/members/{userId}`,
  tag: DEPTS,
  summary: 'Remove a member from a department (idempotent, department.manage)',
  params: DepartmentMemberParams,
  response: successResponse(z.object({ department_id: z.uuid(), user_id: z.uuid() })),
  errors: [400, 401, 403, 404],
});
