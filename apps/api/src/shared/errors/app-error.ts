export interface FieldIssue {
  field: string;
  message: string;
}

/**
 * An error that is safe to show to API clients. Anything that is not an AppError
 * is reported as a generic 500 so internal details never leak.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const Errors = {
  badRequest: (message = 'Bad request', code = 'BAD_REQUEST', details?: unknown) =>
    new AppError(400, code, message, details),

  validation: (issues: FieldIssue[]) =>
    new AppError(
      400,
      'VALIDATION_ERROR',
      issues[0] ? `${issues[0].field}: ${issues[0].message}` : 'Validation failed',
      issues,
    ),

  unauthorized: (message = 'Authentication required', code = 'UNAUTHORIZED') =>
    new AppError(401, code, message),

  forbidden: (message = 'You do not have permission to perform this action', code = 'FORBIDDEN') =>
    new AppError(403, code, message),

  notFound: (message = 'Resource not found', code = 'NOT_FOUND') =>
    new AppError(404, code, message),

  conflict: (message = 'Resource already exists', code = 'CONFLICT') =>
    new AppError(409, code, message),

  tooManyRequests: (message = 'Too many requests, please try again later', code = 'RATE_LIMITED') =>
    new AppError(429, code, message),

  serviceUnavailable: (
    message = 'Service unavailable',
    code = 'SERVICE_UNAVAILABLE',
    details?: unknown,
  ) => new AppError(503, code, message, details),
};
