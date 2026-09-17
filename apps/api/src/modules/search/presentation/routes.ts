import { Router, type RequestHandler } from 'express';
import { createRateLimiter } from '../../../shared/http/rate-limit';
import { validate } from '../../../shared/http/validate';
import type { UserDirectory } from '../../identity';
import type { SearchService } from '../application/search.service';
import { createSearchController } from './search.controller';
import { OverviewQuery, ScopeParams, ScopedQuery } from './schemas';

/** Search across the active organization (spec §13, 16.6). Handlers: search.controller.ts. */
export function createSearchRouter(deps: {
  search: SearchService;
  users: UserDirectory;
  guard: RequestHandler[];
}): Router {
  const { guard } = deps;
  const controller = createSearchController(deps);
  const searchLimiter = createRateLimiter({ windowMs: 60_000, limit: 60 });

  const router = Router();
  router.get(
    '/search',
    searchLimiter,
    ...guard,
    validate({ query: OverviewQuery }),
    controller.overview,
  );
  router.get(
    '/search/:scope',
    searchLimiter,
    ...guard,
    validate({ params: ScopeParams, query: ScopedQuery }),
    controller.scoped,
  );
  return router;
}
