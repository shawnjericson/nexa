import { z } from 'zod';
import './openapi';

/** Page/limit pagination for admin lists and the exam routes. Feeds use keyset cursors instead. */
export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type PageQueryInput = z.infer<typeof PageQuery>;

export const PagePagination = z
  .object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    total_pages: z.number().int(),
    has_next: z.boolean(),
  })
  .openapi('PagePagination');

export function pageWindow({ page, limit }: PageQueryInput): { skip: number; take: number } {
  return { skip: (page - 1) * limit, take: limit };
}

export function toPagePagination(page: { page: number; limit: number; total: number }) {
  const totalPages = Math.ceil(page.total / page.limit);
  return {
    page: page.page,
    limit: page.limit,
    total: page.total,
    total_pages: totalPages,
    has_next: page.page < totalPages,
  };
}
