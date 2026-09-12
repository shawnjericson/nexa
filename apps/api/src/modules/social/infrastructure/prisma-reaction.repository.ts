import type { PrismaClient } from '../../../generated/prisma/client';
import { isUniqueViolation } from '../../../infrastructure/database/prisma-errors';
import { emptyReactionSummary, type ReactionSummary, type ReactionType } from '../domain/content';
import type { ReactionRepository } from '../domain/ports';

export class PrismaReactionRepository implements ReactionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async set(
    organizationId: string,
    postId: string,
    userId: string,
    type: ReactionType,
  ): Promise<{ previous: ReactionType | null }> {
    const where = { postId_userId: { postId, userId } };
    const previous = await this.prisma.reaction.findUnique({ where, select: { type: true } });
    const upsert = () =>
      this.prisma.reaction.upsert({
        where,
        create: { organizationId, postId, userId, type },
        update: { type },
      });

    try {
      await upsert();
    } catch (err) {
      // Two first reactions raced on UNIQUE(post_id, user_id): the loser becomes an update (7.2).
      if (!isUniqueViolation(err)) throw err;
      await upsert();
    }
    return { previous: previous?.type ?? null };
  }

  async remove(organizationId: string, postId: string, userId: string): Promise<void> {
    await this.prisma.reaction.deleteMany({ where: { organizationId, postId, userId } });
  }

  async summarize(
    organizationId: string,
    postIds: readonly string[],
    viewerId: string,
  ): Promise<Map<string, ReactionSummary>> {
    const ids = [...new Set(postIds)];
    const summaries = new Map(ids.map((id) => [id, emptyReactionSummary()]));
    if (ids.length === 0) return summaries;

    const [groups, mine] = await Promise.all([
      this.prisma.reaction.groupBy({
        by: ['postId', 'type'],
        where: { organizationId, postId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.reaction.findMany({
        where: { organizationId, userId: viewerId, postId: { in: ids } },
        select: { postId: true, type: true },
      }),
    ]);

    for (const group of groups) {
      const summary = summaries.get(group.postId);
      if (!summary) continue;
      summary.counts[group.type] = group._count._all;
      summary.total += group._count._all;
    }
    for (const reaction of mine) {
      const summary = summaries.get(reaction.postId);
      if (summary) summary.viewerReaction = reaction.type;
    }
    return summaries;
  }
}
