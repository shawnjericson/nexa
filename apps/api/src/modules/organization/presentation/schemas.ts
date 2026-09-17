import { z } from 'zod';
import '../../../shared/http/openapi';
import { PageQuery } from '../../../shared/http/pagination';
import { UserReference } from '../../identity';
import { SYSTEM_ROLE_KEYS } from '../domain/role-hierarchy';

const Slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/,
    'Slug must be 3-50 lowercase letters, digits or dashes',
  )
  .openapi({ example: 'acme' });

const Timezone = z
  .string()
  .refine(
    (value) => value === 'UTC' || Intl.supportedValuesOf('timeZone').includes(value),
    'Unknown IANA time zone',
  )
  .openapi({ example: 'Asia/Ho_Chi_Minh' });

const LogoUrl = z.url({ protocol: /^https?$/, error: 'Must be an http(s) URL' }).max(2048);
const RoleKey = z.enum(SYSTEM_ROLE_KEYS);
const MembershipStatus = z.enum(['ACTIVE', 'SUSPENDED']);
const Email = z.string().trim().toLowerCase().pipe(z.email('Invalid email address').max(254));
const Description = z.string().trim().max(500).nullable();

const atLeastOne = (body: Record<string, unknown>) =>
  Object.values(body).some((value) => value !== undefined);

// ─── Params ────────────────────────────────────────────────────────────────

export const OrganizationParams = z.object({ organizationId: z.uuid() });
export const MemberParams = OrganizationParams.extend({ userId: z.uuid() });
export const InvitationParams = OrganizationParams.extend({ invitationId: z.uuid() });
export const DepartmentParams = OrganizationParams.extend({ departmentId: z.uuid() });
export const DepartmentMemberParams = DepartmentParams.extend({ userId: z.uuid() });

// ─── Queries ───────────────────────────────────────────────────────────────

export const MemberListQuery = PageQuery.extend({
  q: z.string().trim().max(100).optional().openapi({
    description: 'Name or username; accents and case are ignored, and words match as prefixes',
    example: 'nguyen an',
  }),
  sort: z.enum(['joined', 'newest', 'name']).default('joined').openapi({
    description: 'joined: longest-standing first; newest: most recent first; name: by name',
  }),
  department_id: z
    .union([z.uuid(), z.literal('none')])
    .optional()
    .openapi({ description: 'Only this department, or "none" for people in no department' }),
});

// ─── Requests ──────────────────────────────────────────────────────────────

export const CreateOrganizationBody = z
  .object({
    name: z.string().trim().min(2).max(120).openapi({ example: 'Công ty Ánh Dương' }),
    slug: Slug.optional().openapi({ description: 'Derived from the name when omitted' }),
    timezone: Timezone.optional(),
  })
  .openapi('CreateOrganizationRequest');

export const UpdateOrganizationBody = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    logo_url: LogoUrl.nullable().optional(),
    timezone: Timezone.optional(),
  })
  .refine(atLeastOne, { message: 'Provide at least one field to update' })
  .openapi('UpdateOrganizationRequest');

export const UpdateMemberBody = z
  .object({ role: RoleKey.optional(), status: MembershipStatus.optional() })
  .refine((body) => body.role !== undefined || body.status !== undefined, {
    message: 'Provide role or status',
  })
  .openapi('UpdateMemberRequest');

export const CreateInvitationBody = z
  .object({ email: Email, role: RoleKey.default('MEMBER') })
  .openapi('CreateInvitationRequest');

export const AcceptInvitationBody = z
  .object({ token: z.string().min(1).max(512) })
  .openapi('AcceptInvitationRequest');

export const CreateDepartmentBody = z
  .object({
    name: z.string().trim().min(2).max(100).openapi({ example: 'Phòng Kỹ thuật' }),
    description: Description.optional(),
  })
  .openapi('CreateDepartmentRequest');

export const UpdateDepartmentBody = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    description: Description.optional(),
  })
  .refine(atLeastOne, { message: 'Provide at least one field to update' })
  .openapi('UpdateDepartmentRequest');

// ─── Responses ─────────────────────────────────────────────────────────────

export const OrganizationResponse = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    logo_url: z.string().nullable(),
    timezone: z.string(),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .openapi('Organization');

export const MyOrganization = OrganizationResponse.extend({
  role: z.string(),
  membership_status: MembershipStatus,
  joined_at: z.iso.datetime(),
}).openapi('MyOrganization');

export const OrganizationDetails = OrganizationResponse.extend({
  member_count: z.number().int(),
  my_role: z.string(),
}).openapi('OrganizationDetails');

export const MemberResponse = z
  .object({
    user: UserReference.nullable(),
    role: z.string(),
    status: MembershipStatus,
    joined_at: z.iso.datetime(),
    departments: z.array(z.object({ id: z.uuid(), name: z.string() })),
  })
  .openapi('Member');

export const InvitationResponse = z
  .object({
    id: z.uuid(),
    email: z.string(),
    role: z.string(),
    status: z.enum(['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED']),
    invited_by_id: z.uuid(),
    expires_at: z.iso.datetime(),
    created_at: z.iso.datetime(),
  })
  .openapi('Invitation');

export const CreatedInvitation = InvitationResponse.extend({
  token: z.string().openapi({
    description: 'Shown only once - share it with the invitee. Only its hash is stored.',
  }),
}).openapi('CreatedInvitation');

export const AcceptedInvitation = z
  .object({ organization_id: z.uuid(), role: z.string() })
  .openapi('AcceptedInvitation');

export const DepartmentResponse = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    member_count: z.number().int(),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .openapi('Department');

export type CreateOrganizationInput = z.infer<typeof CreateOrganizationBody>;
export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationBody>;
export type UpdateMemberInput = z.infer<typeof UpdateMemberBody>;
export type CreateInvitationInput = z.infer<typeof CreateInvitationBody>;
export type AcceptInvitationInput = z.infer<typeof AcceptInvitationBody>;
export type CreateDepartmentInput = z.infer<typeof CreateDepartmentBody>;
export type UpdateDepartmentInput = z.infer<typeof UpdateDepartmentBody>;
export type MemberListQueryInput = z.infer<typeof MemberListQuery>;
