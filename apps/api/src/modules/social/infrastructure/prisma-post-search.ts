import type { PrismaClient } from '../../../generated/prisma/client';
import {
  emptySearchPage,
  type SearchPage,
  type SearchQuery,
  type SearchWindow,
} from '../../../shared/search/search-query';
import type { PostSearchHit } from '../domain/search';

/** Content search over posts.search_vector (ADR-018). */
export class PrismaPostSearch {
  constructor(private readonly prisma: PrismaClient) {}

  async search(
    organizationId: string,
    query: SearchQuery,
    { limit, offset }: SearchWindow,
  ): Promise<SearchPage<PostSearchHit>> {
    if (query.terms.length === 0) return emptySearchPage();
    const rows = await this.prisma.$queryRaw<PostSearchHit[]>`
      WITH q AS (SELECT to_tsquery('simple', nexa_unaccent(${query.tsquery})) AS query)
      SELECT p.id, p.author_id AS "authorId", p.type::text AS type, p.content,
             p.created_at AS "createdAt"
        FROM posts p CROSS JOIN q
       WHERE p.organization_id = ${organizationId}::uuid
         AND p.deleted_at IS NULL
         -- What the feed shows. Narrower visibilities must be enforced here once they exist.
         AND p.visibility = 'ORGANIZATION'
         AND p.search_vector @@ q.query
       ORDER BY ts_rank_cd(p.search_vector, q.query) DESC, p.created_at DESC, p.id DESC
       LIMIT ${limit + 1}::int OFFSET ${offset}::int`;
    return { items: rows.slice(0, limit), hasMore: rows.length > limit };
  }
}
