import type { SearchPage, SearchQuery, SearchWindow } from '../../../shared/search/search-query';
import type { PostType } from './content';
import type { Actor } from './policies';

export interface PostSearchHit {
  id: string;
  authorId: string;
  type: PostType;
  content: string;
  createdAt: Date;
}

/** Posts the actor can see in the feed, best match first (risk register 14). */
export type PostSearch = (
  actor: Actor,
  query: SearchQuery,
  window: SearchWindow,
) => Promise<SearchPage<PostSearchHit>>;
