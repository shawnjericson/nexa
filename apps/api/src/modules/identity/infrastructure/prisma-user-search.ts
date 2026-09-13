import type { PrismaClient } from '../../../generated/prisma/client';
import {
  emptySearchPage,
  type SearchPage,
  type SearchQuery,
  type SearchWindow,
} from '../../../shared/search/search-query';
import type { UserSummary } from '../domain/ports';

/** Name and username search over users.search_vector (ADR-018). */
export class PrismaUserSearch {
  constructor(private readonly prisma: PrismaClient) {}

  async search(
    query: SearchQuery,
    { withinIds, limit, offset }: SearchWindow & { withinIds: readonly string[] },
  ): Promise<SearchPage<UserSummary>> {
    if (query.terms.length === 0 || withinIds.length === 0) return emptySearchPage();
    const rows = await this.prisma.$queryRaw<UserSummary[]>`
      WITH q AS (SELECT to_tsquery('simple', nexa_unaccent(${query.tsquery})) AS query)
      SELECT u.id, u.email::text AS email, u.username::text AS username,
             u.display_name AS "displayName", u.avatar_url AS "avatarUrl", u.status::text AS status
        FROM users u CROSS JOIN q
       WHERE u.id = ANY(${[...withinIds]}::uuid[])
         AND u.status = 'ACTIVE'
         AND u.search_vector @@ q.query
       ORDER BY ts_rank_cd(u.search_vector, q.query) DESC, u.display_name, u.id
       LIMIT ${limit + 1}::int OFFSET ${offset}::int`;
    return { items: rows.slice(0, limit), hasMore: rows.length > limit };
  }
}
