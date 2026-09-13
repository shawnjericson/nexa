import type { RequestHandler, Router } from 'express';
import type { ChatSearch } from '../communication';
import type { UserDirectory } from '../identity';
import type { OrganizationDirectory } from '../organization';
import type { PostSearch } from '../social';
import { SearchService } from './application/search.service';
import './presentation/openapi';
import { createSearchRouter } from './presentation/routes';

export interface SearchModule {
  /** Search endpoints, mounted under /api/v1. */
  router: Router;
}

/** Sits on top of the modules it searches and only uses their public contracts (spec §5). */
export function createSearchModule(deps: {
  users: UserDirectory;
  directory: OrganizationDirectory;
  posts: PostSearch;
  chat: ChatSearch;
  /** requireAuth + requireOrganization. */
  guard: RequestHandler[];
}): SearchModule {
  const search = new SearchService({
    // Organization decides who counts as a member; Identity matches their names.
    people: async (actor, query, window) =>
      deps.users.search(query, {
        ...window,
        withinIds: await deps.directory.listActiveMemberIds(actor.organization.organizationId),
      }),
    posts: deps.posts,
    conversations: (actor, query, window) => deps.chat.conversations(actor, query, window),
    messages: (actor, query, window) => deps.chat.messages(actor, query, window),
  });

  return { router: createSearchRouter({ search, users: deps.users, guard: deps.guard }) };
}
