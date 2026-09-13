# ADR-018: Search with PostgreSQL full-text search

- Status: Accepted
- Date: 2026-09-13

## Context

Spec §13 asks for search over permitted users, posts and channels with PostgreSQL full-text
search, and says OpenSearch/Elasticsearch should only come once PostgreSQL is not enough. The risk
register makes a search privacy leak a P0 (14): people may only find what they can already see.

Content is mostly Vietnamese. People type without accents ("bao cao" for "Báo cáo"), and
PostgreSQL ships no Vietnamese stemmer.

## Decision

1. **Accent-insensitive vectors maintained by the database.**
   - `users`, `posts`, `conversations` and `messages` get a generated `search_vector` column with a
     GIN index: `to_tsvector('simple', nexa_unaccent(...))`.
   - The `simple` configuration lowercases words and does no stemming.
   - `nexa_unaccent` is an `IMMUTABLE` wrapper around the trusted `unaccent` extension that pins
     its dictionary, which generated columns require. "Đà Nẵng" is indexed as "da nang".
   - Generated columns change in the same statement as the row, so search never lags behind a
     write (14.1).
   - The Prisma schema declares the columns as `Unsupported("tsvector")` with
     `@default(dbgenerated())`, so migrations never try to drop or alter them.
2. **Queries.**
   - The input is folded the same way (lowercase, no accents). It is split into at most 8 words of
     letters and digits, and each word becomes a prefix: `bao:* & cao:*`. That gives
     search-as-you-type ("phat" finds "phát triển").
   - Because only letters and digits survive, user input can never inject tsquery operators. The
     query is always bound as a parameter.
   - Results are ordered by `ts_rank_cd`, then by recency (or by name).
3. **Each module searches its own data with its own access rules.**
   - The Search module never touches other modules' tables. It calls their public contracts:
     - **People:** Organization supplies the organization's ACTIVE members, and Identity matches
       their names and usernames. Deactivated accounts are left out.
     - **Posts:** Social applies what the feed shows: the organization's posts that are not deleted.
     - **Conversations:** Communication returns the organization's channels (public) and the groups
       the caller belongs to.
     - **Messages:** Communication joins the caller's current conversation memberships. Someone
       removed from a conversation stops finding its messages at once, and organization admins
       find nothing in private conversations (ADR-015).
   - A future visibility rule (department posts, for example) is added where the data lives, next
     to the read path it mirrors.
4. **API.**
   - `GET /api/v1/search?q=` returns the best few results of every kind.
   - `GET /api/v1/search/{people|posts|conversations|messages}?q=&limit=&cursor=` pages through one
     kind.
   - Relevance-ordered pages use an offset cursor, capped at 500 results; past that people
     refine the query.
   - Posts and messages come with a snippet around the first match, plus the character ranges to
     highlight. Clients then don't have to re-implement accent-insensitive matching.
   - Search is limited to 60 requests per minute.

## Consequences

- Words must share a prefix to match; there is no typo tolerance or fuzzy matching. `pg_trgm`
  can add that to people and channel names later.
- People search passes the member ids to Identity. That is fine for organizations of a few
  thousand people; beyond that, a membership-aware query or a read model should replace it.
- Comments and file names are not searchable yet.
- An external search engine becomes worth its cost when relevance tuning, typo tolerance or index
  size outgrow PostgreSQL. Only the modules' search functions would change.
