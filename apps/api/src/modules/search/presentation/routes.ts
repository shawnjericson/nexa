import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import { Errors } from '../../../shared/errors/app-error';
import { createRateLimiter } from '../../../shared/http/rate-limit';
import { ok, paginated } from '../../../shared/http/response';
import { validate } from '../../../shared/http/validate';
import { requireAuthContext, toUserReference, type UserDirectory } from '../../identity';
import { organizationContext, type OrganizationActor } from '../../organization';
import type { SearchResults, SearchScope, SearchService } from '../application/search.service';
import { referencedUserIds, toConversationHit, toMessageHit, toPostHit } from './dto';
import {
  OverviewQuery,
  ScopeParams,
  ScopedQuery,
  type OverviewQueryInput,
  type ScopedQueryInput,
} from './schemas';

/** Relevance-ordered results page by offset; deeper than this, refine the query instead. */
const MAX_OFFSET = 500;

const OffsetCursor = z.object({ o: z.number().int().min(0).max(MAX_OFFSET) });

function encodeOffset(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset })).toString('base64url');
}

function decodeOffset(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    return OffsetCursor.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))).o;
  } catch {
    throw Errors.badRequest('Pagination cursor is invalid', 'INVALID_CURSOR');
  }
}

/** Search across the active organization (spec §13, 16.6). */
export function createSearchRouter(deps: {
  search: SearchService;
  users: UserDirectory;
  guard: RequestHandler[];
}): Router {
  const { search, users, guard } = deps;
  const searchLimiter = createRateLimiter({ windowMs: 60_000, limit: 60 });

  const actorOf = (req: Request): OrganizationActor => ({
    userId: requireAuthContext(req).userId,
    organization: organizationContext(req),
  });

  async function present(results: Partial<SearchResults>, terms: readonly string[]) {
    const posts = results.posts?.items ?? [];
    const messages = results.messages?.items ?? [];
    const directory = await users.getSummaries(referencedUserIds(posts, messages));
    return {
      people: (results.people?.items ?? []).map((user) => toUserReference(user)),
      posts: posts.map((hit) => toPostHit(hit, directory, terms)),
      conversations: (results.conversations?.items ?? []).map(toConversationHit),
      messages: messages.map((hit) => toMessageHit(hit, directory, terms)),
    };
  }

  const overview: RequestHandler = async (req, res) => {
    const { q, limit } = req.query as unknown as OverviewQueryInput;
    const { query, results } = await search.overview(actorOf(req), q, limit);
    const items = await present(results, query.terms);
    ok(res, {
      query: q,
      terms: query.terms,
      people: { items: items.people, has_more: results.people.hasMore },
      posts: { items: items.posts, has_more: results.posts.hasMore },
      conversations: { items: items.conversations, has_more: results.conversations.hasMore },
      messages: { items: items.messages, has_more: results.messages.hasMore },
    });
  };

  const scoped: RequestHandler = async (req, res) => {
    const { scope } = req.params as { scope: SearchScope };
    const { q, limit, cursor } = req.query as unknown as ScopedQueryInput;
    const offset = decodeOffset(cursor);
    const { query, page } = await search.scoped(actorOf(req), scope, q, { limit, offset });
    const items: unknown[] = (await present({ [scope]: page }, query.terms))[scope];
    const next = offset + limit;
    const hasNext = page.hasMore && next <= MAX_OFFSET;
    paginated(res, items, {
      next_cursor: hasNext ? encodeOffset(next) : null,
      has_next: hasNext,
      limit,
    });
  };

  const router = Router();
  router.get('/search', searchLimiter, ...guard, validate({ query: OverviewQuery }), overview);
  router.get(
    '/search/:scope',
    searchLimiter,
    ...guard,
    validate({ params: ScopeParams, query: ScopedQuery }),
    scoped,
  );
  return router;
}
