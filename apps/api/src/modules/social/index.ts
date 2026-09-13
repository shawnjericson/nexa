import type { RequestHandler } from 'express';
import type { PrismaClient } from '../../generated/prisma/client';
import type { EventBus } from '../../shared/events/event-bus';
import type { FileDirectory } from '../file';
import type { UserDirectory } from '../identity';
import { CommentService } from './application/comment.service';
import { PostService } from './application/post.service';
import { ReactionService } from './application/reaction.service';
import type { PostSearch } from './domain/search';
import { PrismaCommentRepository } from './infrastructure/prisma-comment.repository';
import { PrismaPostSearch } from './infrastructure/prisma-post-search';
import { PrismaPostRepository } from './infrastructure/prisma-post.repository';
import { PrismaReactionRepository } from './infrastructure/prisma-reaction.repository';
import './presentation/openapi';
import { createSocialRouters, type SocialRouters } from './presentation/routes';

// Public contract of the Social module.
export {
  COMMENT_CREATED,
  COMMENT_DELETED,
  POST_CREATED,
  POST_DELETED,
  POST_REACTED,
  type CommentCreatedEvent,
  type CommentDeletedEvent,
  type PostCreatedEvent,
  type PostDeletedEvent,
  type PostReactedEvent,
} from './domain/events';
export type { PostSearch, PostSearchHit } from './domain/search';

export interface SocialModule extends SocialRouters {
  /** Post search for the Search module; it applies the same visibility as the feed. */
  search: PostSearch;
}

export function createSocialModule(deps: {
  prisma: PrismaClient;
  events: EventBus;
  /** Identity's public read contract, used to show authors. */
  authors: UserDirectory;
  /** The File module's contract, used to attach and show files. */
  files: FileDirectory;
  /** requireAuth + requireOrganization. */
  guard: RequestHandler[];
}): SocialModule {
  const posts = new PrismaPostRepository(deps.prisma);
  const comments = new PrismaCommentRepository(deps.prisma);
  const reactions = new PrismaReactionRepository(deps.prisma);
  const postSearch = new PrismaPostSearch(deps.prisma);

  return {
    ...createSocialRouters({
      posts: new PostService({ posts, files: deps.files, events: deps.events }),
      comments: new CommentService({ posts, comments, events: deps.events }),
      reactions: new ReactionService({ posts, reactions, events: deps.events }),
      authors: deps.authors,
      files: deps.files,
      guard: deps.guard,
    }),
    search: (actor, query, window) =>
      postSearch.search(actor.organization.organizationId, query, window),
  };
}
