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
  _count: { select: { comments: { where: { deletedAt: null } } } },
} satisfies Prisma.PostSelect;

type PostRow = Prisma.PostGetPayload<{ select: typeof POST_SELECT }>;

function toPost({ _count, ...row }: PostRow): Post {
  return { ...row, commentCount: _count.comments };
}

const NEWEST_FIRST = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.PostOrderByWithRelationInput[];

export class PrismaPostRepository implements PostRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(post: NewPost): Promise<Post> {
    return toPost(await this.prisma.post.create({ data: post, select: POST_SELECT }));
  }

  async findById(organizationId: string, id: string): Promise<Post | null> {
    const row = await this.prisma.post.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: POST_SELECT,
    });
    return row && toPost(row);
  }

  async update(organizationId: string, id: string, changes: PostChanges): Promise<Post | null> {
    try {
      const row = await this.prisma.post.update({
        where: { id, organizationId, deletedAt: null },
        data: changes,
        select: POST_SELECT,
      });
      return toPost(row);
    } catch (err) {
      if (isRecordNotFound(err)) return null;
      throw err;
    }
  }

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
    return rows.map(toPost);
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
    return { items: rows.map(toPost), total };
  }
}
