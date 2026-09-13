import { Router, type Request, type RequestHandler } from 'express';
import { createRateLimiter } from '../../../shared/http/rate-limit';
import { created, ok, paginated } from '../../../shared/http/response';
import { validate } from '../../../shared/http/validate';
import type { FileDirectory } from '../../file';
import { requireAuthContext, type UserDirectory } from '../../identity';
import { organizationContext } from '../../organization';
import type { CommentService } from '../application/comment.service';
import type { PostService } from '../application/post.service';
import type { ReactionService } from '../application/reaction.service';
import { emptyReactionSummary, type Comment, type Post } from '../domain/content';
import type { Actor } from '../domain/policies';
import {
  toCommentResponse,
  toCursorPagination,
  toPagePagination,
  toPostResponse,
  toReactionsResponse,
} from './dto';
import {
  CreateCommentBody,
  CreatePostBody,
  CursorQuery,
  ExamPostIdParams,
  IdParams,
  PageQuery,
  ReactBody,
  UpdatePostBody,
  type CreateCommentInput,
  type CreatePostInput,
  type CursorQueryInput,
  type PageQueryInput,
  type ReactInput,
  type UpdatePostInput,
} from './schemas';

export interface SocialRouters {
  /** Mounted under /api/v1. */
  v1: Router;
  /** Mounted under /api - the exam contract (ADR-010). */
  exam: Router;
}

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
  const { posts, comments, reactions, authors, files, guard } = deps;
  // Spam protection for content creation (risk register 17).
  const writeLimiter = createRateLimiter({ windowMs: 60_000, limit: 30 });

  const actorOf = (req: Request): Actor => ({
    userId: requireAuthContext(req).userId,
    organization: organizationContext(req),
  });
  // v1 routes name the post `:id`, the exam routes `:postId`.
  const postIdOf = (req: Request) => {
    const params = req.params as { id?: string; postId?: string };
    return (params.postId ?? params.id) as string;
  };

  async function presentPosts(actor: Actor, items: Post[]) {
    const [directory, summaries, attachments] = await Promise.all([
      authors.getSummaries(items.map((post) => post.authorId)),
      reactions.summarize(
        actor,
        items.map((post) => post.id),
      ),
      files.describe(
        actor.organization.organizationId,
        items.flatMap((post) => post.attachmentIds),
      ),
    ]);
    return items.map((post) =>
      toPostResponse(
        post,
        directory,
        summaries.get(post.id) ?? emptyReactionSummary(),
        actor,
        attachments,
      ),
    );
  }

  async function presentComments(actor: Actor, items: Comment[]) {
    const directory = await authors.getSummaries(items.map((comment) => comment.authorId));
    return items.map((comment) => toCommentResponse(comment, directory, actor));
  }

  const feed: RequestHandler = async (req, res) => {
    const actor = actorOf(req);
    const query = req.query as unknown as CursorQueryInput;
    const page = await posts.feed(actor, { limit: query.limit, cursor: query.cursor });
    paginated(res, await presentPosts(actor, page.items), toCursorPagination(page, query.limit));
  };

  const feedPage: RequestHandler = async (req, res) => {
    const actor = actorOf(req);
    const query = req.query as unknown as PageQueryInput;
    const page = await posts.feedPage(actor, query);
    paginated(res, await presentPosts(actor, page.items), toPagePagination(page));
  };

  const createPost: RequestHandler = async (req, res) => {
    const actor = actorOf(req);
    const body = req.body as CreatePostInput;
    const post = await posts.create(actor, {
      content: body.content,
      imageUrl: body.image_url ?? null,
      type: body.type,
      attachmentIds: body.attachment_ids,
    });
    const [response] = await presentPosts(actor, [post]);
    created(res, response);
  };

  const getPost: RequestHandler = async (req, res) => {
    const actor = actorOf(req);
    const post = await posts.get(actor, postIdOf(req));
    const [response] = await presentPosts(actor, [post]);
    ok(res, response);
  };

  const updatePost: RequestHandler = async (req, res) => {
    const actor = actorOf(req);
    const body = req.body as UpdatePostInput;
    const post = await posts.update(actor, postIdOf(req), {
      content: body.content,
      imageUrl: body.image_url,
      attachmentIds: body.attachment_ids,
    });
    const [response] = await presentPosts(actor, [post]);
    ok(res, response);
  };

  const deletePost: RequestHandler = async (req, res) => {
    const id = postIdOf(req);
    await posts.delete(actorOf(req), id);
    ok(res, { id, deleted: true });
  };

  const react: RequestHandler = async (req, res) => {
    const body = req.body as ReactInput;
    const summary = await reactions.react(actorOf(req), postIdOf(req), body.type);
    ok(res, toReactionsResponse(summary));
  };

  const unreact: RequestHandler = async (req, res) => {
    const summary = await reactions.unreact(actorOf(req), postIdOf(req));
    ok(res, toReactionsResponse(summary));
  };

  const listComments: RequestHandler = async (req, res) => {
    const actor = actorOf(req);
    const query = req.query as unknown as CursorQueryInput;
    const page = await comments.list(actor, postIdOf(req), query);
    paginated(res, await presentComments(actor, page.items), toCursorPagination(page, query.limit));
  };

  const listCommentsPage: RequestHandler = async (req, res) => {
    const actor = actorOf(req);
    const query = req.query as unknown as PageQueryInput;
    const page = await comments.listPage(actor, postIdOf(req), query);
    paginated(res, await presentComments(actor, page.items), toPagePagination(page));
  };

  const createComment: RequestHandler = async (req, res) => {
    const actor = actorOf(req);
    const body = req.body as CreateCommentInput;
    const comment = await comments.create(actor, postIdOf(req), {
      content: body.content,
      parentId: body.parent_id,
    });
    const [response] = await presentComments(actor, [comment]);
    created(res, response);
  };

  const deleteComment: RequestHandler = async (req, res) => {
    const { id } = req.params as { id: string };
    await comments.delete(actorOf(req), id);
    ok(res, { id, deleted: true });
  };

  const v1 = Router();
  v1.get('/feed', ...guard, validate({ query: CursorQuery }), feed);
  v1.post('/posts', writeLimiter, ...guard, validate({ body: CreatePostBody }), createPost);
  v1.get('/posts/:id', ...guard, validate({ params: IdParams }), getPost);
  v1.put(
    '/posts/:id',
    writeLimiter,
    ...guard,
    validate({ params: IdParams, body: UpdatePostBody }),
    updatePost,
  );
  v1.delete('/posts/:id', ...guard, validate({ params: IdParams }), deletePost);
  v1.post(
    '/posts/:id/reactions',
    writeLimiter,
    ...guard,
    validate({ params: IdParams, body: ReactBody }),
    react,
  );
  v1.delete('/posts/:id/reactions', ...guard, validate({ params: IdParams }), unreact);
  v1.get(
    '/posts/:id/comments',
    ...guard,
    validate({ params: IdParams, query: CursorQuery }),
    listComments,
  );
  v1.post(
    '/posts/:id/comments',
    writeLimiter,
    ...guard,
    validate({ params: IdParams, body: CreateCommentBody }),
    createComment,
  );
  v1.delete('/comments/:id', ...guard, validate({ params: IdParams }), deleteComment);

  // Exam contract: the same use cases under the exam's paths, with page/limit pagination.
  const exam = Router();
  exam.get('/posts', ...guard, validate({ query: PageQuery }), feedPage);
  exam.post('/posts', writeLimiter, ...guard, validate({ body: CreatePostBody }), createPost);
  exam.get('/posts/:id', ...guard, validate({ params: IdParams }), getPost);
  exam.put(
    '/posts/:id',
    writeLimiter,
    ...guard,
    validate({ params: IdParams, body: UpdatePostBody }),
    updatePost,
  );
  exam.delete('/posts/:id', ...guard, validate({ params: IdParams }), deletePost);
  exam.get(
    '/comments/post/:postId',
    ...guard,
    validate({ params: ExamPostIdParams, query: PageQuery }),
    listCommentsPage,
  );
  exam.post(
    '/comments/post/:postId',
    writeLimiter,
    ...guard,
    validate({ params: ExamPostIdParams, body: CreateCommentBody }),
    createComment,
  );
  exam.delete('/comments/:id', ...guard, validate({ params: IdParams }), deleteComment);

  return { v1, exam };
}
