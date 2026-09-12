import { AppError } from '../../../shared/errors/app-error';

export const OrganizationErrors = {
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
};
