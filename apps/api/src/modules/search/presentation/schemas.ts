import { z } from 'zod';
import '../../../shared/http/openapi';
import { UserReference } from '../../identity';
import { SEARCH_SCOPES } from '../application/search.service';

const SearchText = z.string().trim().min(2).max(100).openapi({
  description: 'Words to look for; accents and case are ignored and each word matches a prefix',
  example: 'bao cao',
});

export const OverviewQuery = z.object({
  q: SearchText,
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(10)
    .default(5)
    .openapi({ description: 'Results per kind' }),
});

export const ScopedQuery = z.object({
  q: SearchText,
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(128).optional(),
});

export const ScopeParams = z.object({ scope: z.enum(SEARCH_SCOPES) });

// ─── Responses ─────────────────────────────────────────────────────────────

const Snippet = z
  .object({
    text: z.string(),
    highlights: z.array(z.tuple([z.number().int(), z.number().int()])).openapi({
      description: '[start, end) of each matched word prefix within text (JavaScript offsets)',
    }),
  })
  .openapi('SearchSnippet');

export const PostHit = z
  .object({
    id: z.uuid(),
    author: UserReference.nullable(),
    type: z.enum(['GENERAL', 'ANNOUNCEMENT', 'EVENT', 'POLL']),
    snippet: Snippet,
    created_at: z.iso.datetime(),
  })
  .openapi('PostSearchHit');

export const ConversationHit = z
  .object({
    id: z.uuid(),
    type: z.enum(['DIRECT', 'GROUP', 'CHANNEL']),
    name: z.string().nullable(),
    slug: z.string().nullable(),
    description: z.string().nullable(),
    archived: z.boolean(),
    member_count: z.number().int(),
    joined: z.boolean(),
  })
  .openapi('ConversationSearchHit');

export const MessageHit = z
  .object({
    id: z.uuid(),
    seq: z.number().int(),
    conversation: z.object({
      id: z.uuid(),
      type: z.enum(['DIRECT', 'GROUP', 'CHANNEL']),
      name: z.string().nullable(),
      direct_peer: UserReference.nullable(),
    }),
    sender: UserReference.nullable(),
    snippet: Snippet,
    created_at: z.iso.datetime(),
  })
  .openapi('MessageSearchHit');

const group = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), has_more: z.boolean() });

export const OverviewResponse = z
  .object({
    query: z.string(),
    terms: z.array(z.string()).openapi({ description: 'The words searched for, folded' }),
    people: group(UserReference),
    posts: group(PostHit),
    conversations: group(ConversationHit),
    messages: group(MessageHit),
  })
  .openapi('SearchOverview');

export type OverviewQueryInput = z.infer<typeof OverviewQuery>;
export type ScopedQueryInput = z.infer<typeof ScopedQuery>;
