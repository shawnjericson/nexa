import type { PrismaClient } from '../../../generated/prisma/client';
import type { NewRefreshToken, RefreshTokenRecord, RefreshTokenRepository } from '../domain/ports';

export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(token: NewRefreshToken): Promise<void> {
    await this.prisma.refreshToken.create({ data: token });
  }

  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        familyId: true,
        expiresAt: true,
        revokedAt: true,
        replacedById: true,
      },
    });
  }

  rotate(currentId: string, next: NewRefreshToken, at: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // Conditional update: only one of several concurrent refreshes can revoke the token.
      const { count } = await tx.refreshToken.updateMany({
        where: { id: currentId, revokedAt: null },
        data: { revokedAt: at },
      });
      if (count === 0) return false;

      const successor = await tx.refreshToken.create({ data: next, select: { id: true } });
      await tx.refreshToken.update({
        where: { id: currentId },
        data: { replacedById: successor.id },
      });
      return true;
    });
  }

  async revokeFamily(familyId: string, at: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: at },
    });
  }

  async revokeAllForUser(userId: string, at: Date, keepFamilyId?: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(keepFamilyId && { NOT: { familyId: keepFamilyId } }),
      },
      data: { revokedAt: at },
    });
  }
}
