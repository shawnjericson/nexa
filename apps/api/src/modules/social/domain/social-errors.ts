import { AppError } from '../../../shared/errors/app-error';

export const SocialErrors = {
  // Posts of other organizations are reported as missing, never as forbidden (risk register 5.1).
  postNotFound: () => new AppError(404, 'POST_NOT_FOUND', 'Post not found'),
  commentNotFound: () => new AppError(404, 'COMMENT_NOT_FOUND', 'Comment not found'),
  parentCommentNotFound: () =>
    new AppError(
      404,
      'PARENT_COMMENT_NOT_FOUND',
      'The comment you are replying to does not exist on this post',
    ),
  postEditForbidden: () =>
    new AppError(403, 'POST_EDIT_FORBIDDEN', 'Only the author can edit this post'),
  postDeleteForbidden: () =>
    new AppError(
      403,
      'POST_DELETE_FORBIDDEN',
      'Only the author or a moderator can delete this post',
    ),
  commentDeleteForbidden: () =>
    new AppError(
      403,
      'COMMENT_DELETE_FORBIDDEN',
      'Only the author or a moderator can delete this comment',
    ),
  announcementForbidden: () =>
    new AppError(
      403,
      'ANNOUNCEMENT_FORBIDDEN',
      'Publishing announcements requires the announcement.publish permission',
    ),
  invalidCursor: () => new AppError(400, 'INVALID_CURSOR', 'Pagination cursor is invalid'),
};
