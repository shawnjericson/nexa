import { AppError } from '../../../shared/errors/app-error';

export const NotificationErrors = {
  notFound: () => new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found'),
  invalidCursor: () => new AppError(400, 'INVALID_CURSOR', 'Pagination cursor is invalid'),
};
