import type { Prisma, PrismaClient } from '../../../generated/prisma/client';
import type { Comment } from '../domain/content';
import type { CommentRepository, KeysetCursor, NewComment } from '../domain/ports';

const COMMENT_SELECT = {
  id: true,
  organizationId: true,
  postId: true,
  authorId: true,
  parentId: true,
  content: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CommentSelect;

const OLDEST_FIRST = [
  { createdAt: 'asc' },
  { id: 'asc' },
] satisfies Prisma.CommentOrderByWithRelationInput[];

/** Live comments of live posts in one organization. */
function visible(organizationId: string) {
  return {
    organizationId,
    deletedAt: null,
    post: { deletedAt: null },
  } satisfies Prisma.CommentWhereInput;
}

export class PrismaCommentRepository implements CommentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(comment: NewComment): Promise<Comment> {
    return this.prisma.comment.create({ data: comment, select: COMMENT_SELECT });
  }

  findById(organizationId: string, id: string): Promise<Comment | null> {
    return this.prisma.comment.findFirst({
      where: { id, ...visible(organizationId) },
      select: COMMENT_SELECT,
    });
  }

  listForPost(
    organizationId: string,
    postId: string,
    { take, after }: { take: number; after?: KeysetCursor },
  ): Promise<Comment[]> {
    return this.prisma.comment.findMany({
      where: {
        ...visible(organizationId),
        postId,
        // (created_at, id) > (cursor.created_at, cursor.id)
        ...(after && {
          OR: [
            { createdAt: { gt: after.createdAt } },
            { createdAt: after.createdAt, id: { gt: after.id } },
          ],
        }),
      },
      orderBy: OLDEST_FIRST,
      take,
      select: COMMENT_SELECT,
    });
  }

  async listForPostPage(
    organizationId: string,
    postId: string,
    { skip, take }: { skip: number; take: number },
  ): Promise<{ items: Comment[]; total: number }> {
    const where = { ...visible(organizationId), postId } satisfies Prisma.CommentWhereInput;
    const [items, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        orderBy: OLDEST_FIRST,
        skip,
        take,
        select: COMMENT_SELECT,
      }),
      this.prisma.comment.count({ where }),
    ]);
    return { items, total };
  }

  async softDeleteThread(organizationId: string, id: string, at: Date): Promise<boolean> {
    const { count } = await this.prisma.comment.updateMany({
      where: { organizationId, deletedAt: null, OR: [{ id }, { parentId: id }] },
      data: { deletedAt: at },
    });
    return count > 0;
  }
}
