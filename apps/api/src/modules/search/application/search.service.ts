import {
  emptySearchPage,
  parseSearchQuery,
  type SearchPage,
  type SearchQuery,
  type SearchWindow,
} from '../../../shared/search/search-query';
import type { ConversationSearchHit, MessageSearchHit } from '../../communication';
import type { UserSummary } from '../../identity';
import type { OrganizationActor } from '../../organization';
import type { PostSearchHit } from '../../social';

export const SEARCH_SCOPES = ['people', 'posts', 'conversations', 'messages'] as const;

export type SearchScope = (typeof SEARCH_SCOPES)[number];

export interface SearchResults {
  people: SearchPage<UserSummary>;
  posts: SearchPage<PostSearchHit>;
  conversations: SearchPage<ConversationSearchHit>;
  messages: SearchPage<MessageSearchHit>;
}

type Source<T> = (
  actor: OrganizationActor,
  query: SearchQuery,
  window: SearchWindow,
) => Promise<SearchPage<T>>;

/** Each module searches its own data with its own access rules (risk register 14). */
export type SearchSources = {
  [Scope in SearchScope]: Source<SearchResults[Scope]['items'][number]>;
};

/**
 * Orchestrates search across modules (spec §13). It never queries another module's tables: each
 * source applies the same visibility as the module's own read endpoints.
 */
export class SearchService {
  constructor(private readonly sources: SearchSources) {}

  /** The best few results of every kind, e.g. for a search box's dropdown. */
  async overview(
    actor: OrganizationActor,
    text: string,
    perScope: number,
  ): Promise<{ query: SearchQuery; results: SearchResults }> {
    const query = parseSearchQuery(text);
    const window = { limit: perScope, offset: 0 };
    const [people, posts, conversations, messages] = await Promise.all([
      this.run(this.sources.people, actor, query, window),
      this.run(this.sources.posts, actor, query, window),
      this.run(this.sources.conversations, actor, query, window),
      this.run(this.sources.messages, actor, query, window),
    ]);
    return { query, results: { people, posts, conversations, messages } };
  }

  /** One kind of result, paged. */
  async scoped<Scope extends SearchScope>(
    actor: OrganizationActor,
    scope: Scope,
    text: string,
    window: SearchWindow,
  ): Promise<{ query: SearchQuery; page: SearchResults[Scope] }> {
    const query = parseSearchQuery(text);
    const source = this.sources[scope] as Source<SearchResults[Scope]['items'][number]>;
    const page = (await this.run(source, actor, query, window)) as SearchResults[Scope];
    return { query, page };
  }

  private run<T>(
    source: Source<T>,
    actor: OrganizationActor,
    query: SearchQuery,
    window: SearchWindow,
  ): Promise<SearchPage<T>> {
    // Punctuation-only input has no words to look for.
    if (query.terms.length === 0) return Promise.resolve(emptySearchPage<T>());
    return source(actor, query, window);
  }
}
