import type { Prisma, PrismaClient } from '../../../generated/prisma/client';
import { isRecordNotFound } from '../../../infrastructure/database/prisma-errors';
import type { Post } from '../domain/content';
import type { KeysetCursor, NewPost, PostChanges, PostRepository } from '../domain/ports';

const POST_SELECT = {
  id: true,
  organizationId: true,
  authorId: true,
  content: true,
  imageUrl: true,
  type: true,
  visibility: true,
  createdAt: true,
  updatedAt: true,
  attachments: { select: { fileId: true }, orderBy: { position: 'asc' } },
} satisfies Prisma.PostSelect;

type PostRow = Prisma.PostGetPayload<{ select: typeof POST_SELECT }>;
type Db = PrismaClient | Prisma.TransactionClient;

function toPost({ attachments, ...row }: PostRow, commentCount: number): Post {
  return {
    ...row,
    commentCount,
    attachmentIds: attachments.map((attachment) => attachment.fileId),
  };
}

/**
 * Posts with their comment counts, counting only these posts' comments. Not Prisma's filtered
 * `_count`: that joins a GROUP BY over every comment in the table, which took 2.8 seconds per
 * feed page with 200,000 comments (load/README.md) and grew with every comment anyone wrote.
 * This goes through the comments (post_id, created_at, id) index instead.
 */
async function withCommentCounts(db: Db, rows: PostRow[]): Promise<Post[]> {
  if (rows.length === 0) return [];
  const groups = await db.comment.groupBy({
    by: ['postId'],
    where: { postId: { in: rows.map((row) => row.id) }, deletedAt: null },
    _count: { _all: true },
  });
  const counts = new Map(groups.map((group) => [group.postId, group._count._all]));
  return rows.map((row) => toPost(row, counts.get(row.id) ?? 0));
}

const NEWEST_FIRST = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.PostOrderByWithRelationInput[];

// Round trips to the database add up inside these transactions, so allow more than the defaults.
const WRITE_TRANSACTION = { maxWait: 10_000, timeout: 20_000 };

const attachmentRows = (organizationId: string, postId: string, fileIds: readonly string[]) =>
  fileIds.map((fileId, position) => ({ organizationId, postId, fileId, position }));

export class PrismaPostRepository implements PostRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create({ attachmentIds, ...post }: NewPost): Promise<Post> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.post.create({ data: post, select: POST_SELECT });
      if (attachmentIds.length > 0) {
        await tx.postAttachment.createMany({
          data: attachmentRows(post.organizationId, row.id, attachmentIds),
        });
      }
      return { ...toPost(row, 0), attachmentIds };
    }, WRITE_TRANSACTION);
  }

  async findById(organizationId: string, id: string): Promise<Post | null> {
    const row = await this.prisma.post.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: POST_SELECT,
    });
    if (!row) return null;
    const [post] = await withCommentCounts(this.prisma, [row]);
    return post ?? null;
  }

  async update(
    organizationId: string,
    id: string,
    { attachmentIds, ...changes }: PostChanges,
  ): Promise<Post | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Throws "record not found" when the post was deleted meanwhile: deletion wins.
        await tx.post.update({
          where: { id, organizationId, deletedAt: null },
          data: { ...changes, ...(attachmentIds && { updatedAt: new Date() }) },
          select: { id: true },
        });
        if (attachmentIds) {
          await tx.postAttachment.deleteMany({ where: { postId: id } });
          if (attachmentIds.length > 0) {
            await tx.postAttachment.createMany({
              data: attachmentRows(organizationId, id, attachmentIds),
            });
          }
        }
        const row = await tx.post.findUniqueOrThrow({ where: { id }, select: POST_SELECT });
        const [post] = await withCommentCounts(tx, [row]);
        return post!;
      }, WRITE_TRANSACTION);
    } catch (err) {
      if (isRecordNotFound(err)) return null;
      throw err;
    }
  }

  /** Attachments stay with a deleted post, for moderation and audit (ADR-017). */
  async softDelete(organizationId: string, id: string, at: Date): Promise<boolean> {
    const { count } = await this.prisma.post.updateMany({
      where: { id, organizationId, deletedAt: null },
      data: { deletedAt: at },
    });
    return count > 0;
  }

  async listFeed(
    organizationId: string,
    { take, after }: { take: number; after?: KeysetCursor },
  ): Promise<Post[]> {
    const rows = await this.prisma.post.findMany({
      where: {
        organizationId,
        deletedAt: null,
        // (created_at, id) < (cursor.created_at, cursor.id)
        ...(after && {
          OR: [
            { createdAt: { lt: after.createdAt } },
            { createdAt: after.createdAt, id: { lt: after.id } },
          ],
        }),
      },
      orderBy: NEWEST_FIRST,
      take,
      select: POST_SELECT,
    });
    return withCommentCounts(this.prisma, rows);
  }

  async listFeedPage(
    organizationId: string,
    { skip, take }: { skip: number; take: number },
  ): Promise<{ items: Post[]; total: number }> {
    const where = { organizationId, deletedAt: null } satisfies Prisma.PostWhereInput;
    const [rows, total] = await Promise.all([
      this.prisma.post.findMany({ where, orderBy: NEWEST_FIRST, skip, take, select: POST_SELECT }),
      this.prisma.post.count({ where }),
    ]);
    return { items: await withCommentCounts(this.prisma, rows), total };
  }
}
