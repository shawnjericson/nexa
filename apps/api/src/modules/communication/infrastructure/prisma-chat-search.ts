import type { PrismaClient } from '../../../generated/prisma/client';
import {
  emptySearchPage,
  type SearchPage,
  type SearchQuery,
  type SearchWindow,
} from '../../../shared/search/search-query';
import type { ChatActor } from '../domain/policies';
import type { ChatSearch, ConversationSearchHit, MessageSearchHit } from '../domain/search';

const page = <T>(rows: T[], limit: number): SearchPage<T> => ({
  items: rows.slice(0, limit),
  hasMore: rows.length > limit,
});

/** Search over conversations.search_vector and messages.search_vector (ADR-018). */
export class PrismaChatSearch implements ChatSearch {
  constructor(private readonly prisma: PrismaClient) {}

  async conversations(
    actor: ChatActor,
    query: SearchQuery,
    { limit, offset }: SearchWindow,
  ): Promise<SearchPage<ConversationSearchHit>> {
    if (query.terms.length === 0) return emptySearchPage();
    const { userId } = actor;
    const rows = await this.prisma.$queryRaw<ConversationSearchHit[]>`
      WITH q AS (SELECT to_tsquery('simple', nexa_unaccent(${query.tsquery})) AS query)
      SELECT c.id, c.type::text AS type, c.name, c.slug::text AS slug, c.description,
             (c.archived_at IS NOT NULL) AS archived,
             (SELECT count(*)::int FROM conversation_members m
               WHERE m.conversation_id = c.id) AS "memberCount",
             EXISTS (SELECT 1 FROM conversation_members m
                      WHERE m.conversation_id = c.id AND m.user_id = ${userId}::uuid) AS joined
        FROM conversations c CROSS JOIN q
       WHERE c.organization_id = ${actor.organization.organizationId}::uuid
         AND c.search_vector @@ q.query
         -- Channels are public within the organization; groups only exist for their members.
         AND (c.type = 'CHANNEL'
              OR (c.type = 'GROUP' AND EXISTS (
                    SELECT 1 FROM conversation_members m
                     WHERE m.conversation_id = c.id AND m.user_id = ${userId}::uuid)))
       ORDER BY (c.archived_at IS NULL) DESC, ts_rank_cd(c.search_vector, q.query) DESC,
                c.name, c.id
       LIMIT ${limit + 1}::int OFFSET ${offset}::int`;
    return page(rows, limit);
  }

  async messages(
    actor: ChatActor,
    query: SearchQuery,
    { limit, offset }: SearchWindow,
  ): Promise<SearchPage<MessageSearchHit>> {
    if (query.terms.length === 0) return emptySearchPage();
    const { userId } = actor;
    // Joining the caller's current memberships is the whole access check: someone removed from
    // a conversation stops finding its messages at once.
    const rows = await this.prisma.$queryRaw<MessageSearchHit[]>`
      WITH q AS (SELECT to_tsquery('simple', nexa_unaccent(${query.tsquery})) AS query)
      SELECT m.id, m.seq, m.conversation_id AS "conversationId",
             c.type::text AS "conversationType", c.name AS "conversationName",
             CASE WHEN c.type = 'DIRECT' THEN (
               SELECT other.user_id FROM conversation_members other
                WHERE other.conversation_id = c.id AND other.user_id <> ${userId}::uuid
                LIMIT 1)
             END AS "directPeerId",
             m.sender_id AS "senderId", m.content, m.created_at AS "createdAt"
        FROM messages m
        JOIN conversation_members me
          ON me.conversation_id = m.conversation_id AND me.user_id = ${userId}::uuid
        JOIN conversations c ON c.id = m.conversation_id
        CROSS JOIN q
       WHERE m.organization_id = ${actor.organization.organizationId}::uuid
         AND m.deleted_at IS NULL
         AND m.search_vector @@ q.query
       ORDER BY ts_rank_cd(m.search_vector, q.query) DESC, m.created_at DESC, m.id DESC
       LIMIT ${limit + 1}::int OFFSET ${offset}::int`;
    return page(rows, limit);
  }
}
