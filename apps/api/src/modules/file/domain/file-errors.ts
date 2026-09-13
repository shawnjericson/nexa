import { AppError } from '../../../shared/errors/app-error';

export const FileErrors = {
  // Someone else's file answers the same as a missing one, so file ids can't be probed.
  notFound: () => new AppError(404, 'FILE_NOT_FOUND', 'File not found'),
  notReady: () =>
    new AppError(409, 'FILE_NOT_READY', 'The file has not finished uploading and being checked'),
  uploadIncomplete: () =>
    new AppError(409, 'UPLOAD_INCOMPLETE', 'Nothing has been uploaded to the upload URL yet'),
  uploadFailed: (reason: string) =>
    new AppError(409, 'UPLOAD_FAILED', `The upload failed: ${reason}`),
  rejected: (reason: string) =>
    new AppError(422, 'FILE_REJECTED', `The file was rejected: ${reason}`),
  tooLarge: (maxBytes: number) =>
    new AppError(413, 'FILE_TOO_LARGE', `Files can be at most ${maxBytes} bytes`),
  tooManyPending: () =>
    new AppError(
      429,
      'TOO_MANY_PENDING_UPLOADS',
      'Finish your current uploads before starting new ones',
    ),
  storageNotConfigured: () =>
    new AppError(503, 'FILE_STORAGE_UNAVAILABLE', 'File storage is not configured on this server'),
  storageUnavailable: () =>
    new AppError(
      503,
      'FILE_STORAGE_UNAVAILABLE',
      'File storage is temporarily unavailable, please retry',
    ),
};
