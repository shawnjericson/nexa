import { AppError } from '../../../shared/errors/app-error';

export const OrganizationErrors = {
  // ─── Context ───────────────────────────────────────────────────────────
  invalidOrganizationId: () =>
    new AppError(400, 'INVALID_ORGANIZATION_ID', 'X-Organization-Id must be a UUID'),
  contextRequired: () =>
    new AppError(
      400,
      'ORGANIZATION_CONTEXT_REQUIRED',
      'You belong to several organizations; choose one with the X-Organization-Id header',
    ),
  // Same answer whether the organization exists or not, so organizations can't be probed.
  notAMember: () => new AppError(403, 'NOT_A_MEMBER', 'You are not a member of this organization'),
  noOrganization: () =>
    new AppError(403, 'NO_ORGANIZATION', 'You are not a member of any organization'),
  membershipSuspended: () =>
    new AppError(403, 'MEMBERSHIP_SUSPENDED', 'Your membership in this organization is suspended'),
  permissionDenied: (permission: string) =>
    new AppError(403, 'PERMISSION_DENIED', `This action requires the "${permission}" permission`),

  // ─── Organizations ─────────────────────────────────────────────────────
  slugTaken: () =>
    new AppError(409, 'ORGANIZATION_SLUG_TAKEN', 'This organization slug is already taken'),
  invalidSlug: () =>
    new AppError(
      400,
      'INVALID_SLUG',
      'Slug must be 3-50 lowercase letters, digits or dashes; provide one explicitly',
    ),

  // ─── Members ───────────────────────────────────────────────────────────
  memberNotFound: () =>
    new AppError(404, 'MEMBER_NOT_FOUND', 'This person is not a member of the organization'),
  memberManagementForbidden: () =>
    new AppError(
      403,
      'MEMBER_MANAGEMENT_FORBIDDEN',
      'You can only manage members whose role is below yours',
    ),
  roleAssignmentForbidden: (role: string) =>
    new AppError(403, 'ROLE_ASSIGNMENT_FORBIDDEN', `You cannot grant the ${role} role`),
  lastOwner: () =>
    new AppError(
      409,
      'LAST_OWNER',
      'The organization must keep at least one active owner; make someone else an owner first',
    ),
  cannotSuspendSelf: () => new AppError(400, 'CANNOT_SUSPEND_SELF', 'You cannot suspend yourself'),
  alreadyMember: () =>
    new AppError(409, 'ALREADY_MEMBER', 'This person is already a member of the organization'),

  // ─── Invitations ───────────────────────────────────────────────────────
  invitationNotFound: () => new AppError(404, 'INVITATION_NOT_FOUND', 'Invitation not found'),
  invitationRevoked: () =>
    new AppError(410, 'INVITATION_REVOKED', 'This invitation has been revoked'),
  invitationExpired: () =>
    new AppError(410, 'INVITATION_EXPIRED', 'This invitation has expired; ask for a new one'),
  invitationAlreadyUsed: () =>
    new AppError(409, 'INVITATION_ALREADY_USED', 'This invitation has already been used'),
  invitationEmailMismatch: () =>
    new AppError(
      403,
      'INVITATION_EMAIL_MISMATCH',
      'This invitation was sent to a different email address',
    ),

  // ─── Departments ───────────────────────────────────────────────────────
  departmentNotFound: () => new AppError(404, 'DEPARTMENT_NOT_FOUND', 'Department not found'),
  departmentExists: () =>
    new AppError(409, 'DEPARTMENT_EXISTS', 'A department with this name already exists'),
  invalidDepartmentName: () =>
    new AppError(400, 'INVALID_DEPARTMENT_NAME', 'Department name must contain letters or digits'),
};
