import { AppError } from '../../../shared/errors/app-error';

export const IdentityErrors = {
  emailTaken: () => new AppError(409, 'EMAIL_TAKEN', 'Email is already registered'),
  usernameTaken: () => new AppError(409, 'USERNAME_TAKEN', 'Username is already taken'),
  // Same message for unknown email and wrong password so accounts can't be enumerated.
  invalidCredentials: () => new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'),
  accountDeactivated: () =>
    new AppError(403, 'ACCOUNT_DEACTIVATED', 'This account has been deactivated'),
  missingToken: () => new AppError(401, 'UNAUTHORIZED', 'Authentication required'),
  invalidToken: () => new AppError(401, 'INVALID_TOKEN', 'Access token is invalid'),
  tokenExpired: () => new AppError(401, 'TOKEN_EXPIRED', 'Access token has expired'),
  invalidRefreshToken: () =>
    new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired'),
  refreshTokenReused: () =>
    new AppError(
      401,
      'REFRESH_TOKEN_REUSED',
      'Refresh token was already used; the session has been revoked',
    ),
  invalidCurrentPassword: () =>
    new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect'),
  userNotFound: () => new AppError(404, 'USER_NOT_FOUND', 'User not found'),

  // ─── External sign-in ──────────────────────────────────────────────────
  ssoNotConfigured: () =>
    new AppError(404, 'SSO_NOT_CONFIGURED', 'Signing in with this provider is not enabled'),
  invalidExternalToken: () =>
    new AppError(
      401,
      'INVALID_EXTERNAL_TOKEN',
      'The sign-in with the provider could not be verified',
    ),
  externalEmailUnverified: () =>
    new AppError(
      403,
      'EXTERNAL_EMAIL_UNVERIFIED',
      'The provider has not verified this email address',
    ),
  accountLinkRequired: (linkToken: string, email: string) =>
    new AppError(
      409,
      'ACCOUNT_LINK_REQUIRED',
      'An account with this email already exists; confirm its password to connect the provider',
      { link_token: linkToken, email },
    ),
  invalidLinkToken: () =>
    new AppError(
      401,
      'INVALID_LINK_TOKEN',
      'The connection request has expired; sign in with the provider again',
    ),
  demoUnavailable: () => new AppError(404, 'DEMO_UNAVAILABLE', 'There is no demo on this server'),
  guestNotAllowed: () =>
    new AppError(403, 'GUEST_NOT_ALLOWED', 'Create an account of your own to do this'),
};
