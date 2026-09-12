import type { RequestHandler } from 'express';
import type { PrismaClient } from '../../generated/prisma/client';
import type { EventBus } from '../../shared/events/event-bus';
import type { UserDirectory } from '../identity';
import { CommentService } from './application/comment.service';
import { PostService } from './application/post.service';
import { PrismaCommentRepository } from './infrastructure/prisma-comment.repository';
import { PrismaPostRepository } from './infrastructure/prisma-post.repository';
import './presentation/openapi';
import { createSocialRouters, type SocialRouters } from './presentation/routes';

// Public contract of the Social module.
export {
  COMMENT_CREATED,
  POST_CREATED,
  type CommentCreatedEvent,
  type PostCreatedEvent,
} from './domain/events';

export function createSocialModule(deps: {
  prisma: PrismaClient;
  events: EventBus;
  /** Identity's public read contract, used to show authors. */
  authors: UserDirectory;
  /** requireAuth + requireOrganization. */
  guard: RequestHandler[];
}): SocialRouters {
  const posts = new PrismaPostRepository(deps.prisma);
  const comments = new PrismaCommentRepository(deps.prisma);

  return createSocialRouters({
    posts: new PostService({ posts, events: deps.events }),
    comments: new CommentService({ posts, comments, events: deps.events }),
    authors: deps.authors,
    guard: deps.guard,
  });
}
