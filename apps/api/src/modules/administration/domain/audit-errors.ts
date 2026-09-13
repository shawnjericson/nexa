import { AppError } from '../../../shared/errors/app-error';

export const AuditErrors = {
  unavailable: () =>
    new AppError(503, 'AUDIT_UNAVAILABLE', 'The audit log is not configured on this server'),
  invalidCursor: () => new AppError(400, 'INVALID_CURSOR', 'Pagination cursor is invalid'),
};
