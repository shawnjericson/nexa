import { toUserReference, type UserSummary } from '../../identity';
import type { OrganizationDetails } from '../application/organization-management.service';
import { invitationState, type Invitation } from '../domain/invitation';
import type {
  Department,
  DepartmentRef,
  Member,
  Organization,
  OrganizationWithMembership,
} from '../domain/ports';

export function toOrganizationResponse(organization: Organization) {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    logo_url: organization.logoUrl,
    timezone: organization.timezone,
    created_at: organization.createdAt.toISOString(),
    updated_at: organization.updatedAt.toISOString(),
  };
}

export function toMyOrganizationResponse(organization: OrganizationWithMembership) {
  return {
    ...toOrganizationResponse(organization),
    role: organization.roleKey,
    membership_status: organization.membershipStatus,
    joined_at: organization.joinedAt.toISOString(),
  };
}

export function toOrganizationDetailsResponse(details: OrganizationDetails) {
  return {
    ...toOrganizationResponse(details.organization),
    member_count: details.memberCount,
    my_role: details.myRole,
  };
}

export function toMemberResponse(
  member: Member,
  users: ReadonlyMap<string, UserSummary>,
  departments: ReadonlyMap<string, DepartmentRef[]> = new Map(),
) {
  return {
    user: toUserReference(users.get(member.userId)),
    role: member.roleKey,
    status: member.status,
    joined_at: member.joinedAt.toISOString(),
    departments: departments.get(member.userId) ?? [],
  };
}

export function toInvitationResponse(invitation: Invitation, now = new Date()) {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.roleKey,
    status: invitationState(invitation, now),
    invited_by_id: invitation.invitedById,
    expires_at: invitation.expiresAt.toISOString(),
    created_at: invitation.createdAt.toISOString(),
  };
}

export function toDepartmentResponse(department: Department) {
  return {
    id: department.id,
    name: department.name,
    slug: department.slug,
    description: department.description,
    member_count: department.memberCount,
    created_at: department.createdAt.toISOString(),
    updated_at: department.updatedAt.toISOString(),
  };
}
