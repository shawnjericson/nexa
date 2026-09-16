import type { Prisma, PrismaClient } from '../../../generated/prisma/client';
import {
  describeUniqueViolation,
  isUniqueViolation,
} from '../../../infrastructure/database/prisma-errors';
import { IdentityErrors } from '../domain/identity-errors';
import type {
  CreateUserData,
  ExternalIdentity,
  UpdateProfileData,
  UserRepository,
  UserSummary,
} from '../domain/ports';
import type { User } from '../domain/user';

const SUMMARY_SELECT = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  status: true,
} satisfies Prisma.UserSelect;

function toIdentityConflict(err: unknown): unknown {
  if (!isUniqueViolation(err)) return err;
  const detail = describeUniqueViolation(err);
  if (detail.includes('email')) return IdentityErrors.emailTaken();
  if (detail.includes('username')) return IdentityErrors.usernameTaken();
  return err;
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  // email is citext, so this lookup is case-insensitive.
  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findSummaries(ids: readonly string[]): Promise<UserSummary[]> {
    return this.prisma.user.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: SUMMARY_SELECT,
    });
  }

  findSummaryByEmail(email: string): Promise<UserSummary | null> {
    return this.prisma.user.findUnique({ where: { email }, select: SUMMARY_SELECT });
  }

  async create(data: CreateUserData): Promise<User> {
    try {
      return await this.prisma.user.create({ data });
    } catch (err) {
      throw toIdentityConflict(err);
    }
  }

  async createWithIdentity(
    data: CreateUserData & { avatarUrl: string | null },
    identity: ExternalIdentity,
  ): Promise<User> {
    try {
      return await this.prisma.user.create({ data: { ...data, identities: { create: identity } } });
    } catch (err) {
      throw toIdentityConflict(err);
    }
  }

  async updateProfile(id: string, data: UpdateProfileData): Promise<User> {
    try {
      return await this.prisma.user.update({
        where: { id },
        // A picture link set directly replaces an uploaded avatar, which cleanup may then purge.
        data: { ...data, ...(data.avatarUrl !== undefined && { avatarFileId: null }) },
      });
    } catch (err) {
      throw toIdentityConflict(err);
    }
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  recordLogin(id: string, at: Date): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { lastLoginAt: at } });
  }

  async findByIdentity(provider: string, subject: string): Promise<User | null> {
    const identity = await this.prisma.userIdentity.findUnique({
      where: { provider_subject: { provider, subject } },
      select: { user: true },
    });
    return identity?.user ?? null;
  }

  async linkIdentity(userId: string, identity: ExternalIdentity): Promise<void> {
    await this.prisma.userIdentity.upsert({
      where: { provider_subject: { provider: identity.provider, subject: identity.subject } },
      create: { userId, ...identity },
      update: {},
    });
  }

  async updateAvatar(id: string, avatar: { fileId: string; url: string } | null): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { avatarFileId: avatar?.fileId ?? null, avatarUrl: avatar?.url ?? null },
    });
  }
}
