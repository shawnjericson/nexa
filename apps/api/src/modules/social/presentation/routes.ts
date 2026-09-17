import { Router, type RequestHandler } from 'express';
import { createRateLimiter } from '../../../shared/http/rate-limit';
import { validate } from '../../../shared/http/validate';
import type { FileDirectory } from '../../file';
import type { UserDirectory } from '../../identity';
import type { CommentService } from '../application/comment.service';
import type { PostService } from '../application/post.service';
import type { ReactionService } from '../application/reaction.service';
import { createSocialController } from './social.controller';
import {
  CreateCommentBody,
  CreatePostBody,
  CursorQuery,
  ExamPostIdParams,
  IdParams,
  PageQuery,
  ReactBody,
  UpdatePostBody,
} from './schemas';

export interface SocialRouters {
  /** Mounted under /api/v1. */
  v1: Router;
  /** Mounted under /api - the exam contract (ADR-010). */
  exam: Router;
}

/** Social routes: paths, rate limits and validation. The handlers are in social.controller.ts. */
export function createSocialRouters(deps: {
  posts: PostService;
  comments: CommentService;
  reactions: ReactionService;
  authors: UserDirectory;
  /** Shows attachments; access follows the post's visibility. */
  files: FileDirectory;
  /** requireAuth + requireOrganization, applied per route so unknown paths still 404. */
  guard: RequestHandler[];
}): SocialRouters {
  const { guard } = deps;
  const controller = createSocialController(deps);
  // Spam protection for content creation (risk register 17).
  const writeLimiter = createRateLimiter({ windowMs: 60_000, limit: 30 });

  const v1 = Router();
  v1.get('/feed', ...guard, validate({ query: CursorQuery }), controller.feed);
  v1.post(
    '/posts',
    writeLimiter,
    ...guard,
    validate({ body: CreatePostBody }),
    controller.createPost,
  );
  v1.get('/posts/:id', ...guard, validate({ params: IdParams }), controller.getPost);
  v1.put(
    '/posts/:id',
    writeLimiter,
    ...guard,
    validate({ params: IdParams, body: UpdatePostBody }),
    controller.updatePost,
  );
  v1.delete('/posts/:id', ...guard, validate({ params: IdParams }), controller.deletePost);
  v1.post(
    '/posts/:id/reactions',
    writeLimiter,
    ...guard,
    validate({ params: IdParams, body: ReactBody }),
    controller.react,
  );
  v1.delete('/posts/:id/reactions', ...guard, validate({ params: IdParams }), controller.unreact);
  v1.get(
    '/posts/:id/comments',
    ...guard,
    validate({ params: IdParams, query: CursorQuery }),
    controller.listComments,
  );
  v1.post(
    '/posts/:id/comments',
    writeLimiter,
    ...guard,
    validate({ params: IdParams, body: CreateCommentBody }),
    controller.createComment,
  );
  v1.delete('/comments/:id', ...guard, validate({ params: IdParams }), controller.deleteComment);

  // Exam contract: the same use cases under the exam's paths, with page/limit pagination, and
  // the exam's rule that only the author edits or deletes.
  const exam = Router();
  exam.use(controller.examContract);
  exam.get('/posts', ...guard, validate({ query: PageQuery }), controller.feedPage);
  exam.post(
    '/posts',
    writeLimiter,
    ...guard,
    validate({ body: CreatePostBody }),
    controller.createPost,
  );
  exam.get('/posts/:id', ...guard, validate({ params: IdParams }), controller.getPost);
  exam.put(
    '/posts/:id',
    writeLimiter,
    ...guard,
    validate({ params: IdParams, body: UpdatePostBody }),
    controller.updatePost,
  );
  exam.delete('/posts/:id', ...guard, validate({ params: IdParams }), controller.deletePost);
  exam.get(
    '/comments/post/:postId',
    ...guard,
    validate({ params: ExamPostIdParams, query: PageQuery }),
    controller.listCommentsPage,
  );
  exam.post(
    '/comments/post/:postId',
    writeLimiter,
    ...guard,
    validate({ params: ExamPostIdParams, body: CreateCommentBody }),
    controller.createComment,
  );
  exam.delete('/comments/:id', ...guard, validate({ params: IdParams }), controller.deleteComment);

  return { v1, exam };
}
