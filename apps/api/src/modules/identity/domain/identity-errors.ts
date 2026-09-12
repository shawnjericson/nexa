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
};
