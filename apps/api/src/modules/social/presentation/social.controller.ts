import type { Request, RequestHandler } from 'express';
import { created, ok, paginated } from '../../../shared/http/response';
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
import type {
  CreateCommentInput,
  CreatePostInput,
  CursorQueryInput,
  PageQueryInput,
  ReactInput,
  UpdatePostInput,
} from './schemas';

/**
 * Handlers for posts, comments and reactions: read the request, call the services, shape the
 * response. The same handlers serve /api/v1 and the exam's /api (see social.routes.ts).
 */
export function createSocialController(deps: {
  posts: PostService;
  comments: CommentService;
  reactions: ReactionService;
  authors: UserDirectory;
  /** Shows attachments; access follows the post's visibility. */
  files: FileDirectory;
}) {
  const { posts, comments, reactions, authors, files } = deps;

  // NEXA lets moderators remove other people's content (ADR-013). The exam has no moderators:
  // only the author may edit or delete (SRS §4) - and the first person to register owns the
  // default organization, so without this they could delete everyone's posts through /api.
  // Requests through the exam router act without post.moderate, so the checks and the
  // can_delete hints both follow the exam's rule there.
  const examRequests = new WeakSet<Request>();
  const examContract: RequestHandler = (req, _res, next) => {
    examRequests.add(req);
    next();
  };
  const actorOf = (req: Request): Actor => {
    const organization = organizationContext(req);
    return {
      userId: requireAuthContext(req).userId,
      organization: examRequests.has(req)
        ? {
            ...organization,
            permissions: new Set(
              [...organization.permissions].filter((key) => key !== 'post.moderate'),
            ),
          }
        : organization,
    };
  };
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

  return {
    examContract,
    feed,
    feedPage,
    createPost,
    getPost,
    updatePost,
    deletePost,
    react,
    unreact,
    listComments,
    listCommentsPage,
    createComment,
    deleteComment,
  };
}
