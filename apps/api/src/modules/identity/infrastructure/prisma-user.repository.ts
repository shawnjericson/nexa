import type { PrismaClient } from '../../../generated/prisma/client';
import {
  describeUniqueViolation,
  isUniqueViolation,
} from '../../../infrastructure/database/prisma-errors';
import { IdentityErrors } from '../domain/identity-errors';
import type { CreateUserData, UpdateProfileData, UserRepository } from '../domain/ports';
import type { User } from '../domain/user';

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

  async create(data: CreateUserData): Promise<User> {
    try {
      return await this.prisma.user.create({ data });
    } catch (err) {
      throw toIdentityConflict(err);
    }
  }

  async updateProfile(id: string, data: UpdateProfileData): Promise<User> {
    try {
      return await this.prisma.user.update({ where: { id }, data });
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
}
