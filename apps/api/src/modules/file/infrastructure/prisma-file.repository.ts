import type { Prisma, PrismaClient } from '../../../generated/prisma/client';
import {
  isForeignKeyViolation,
  isRecordNotFound,
} from '../../../infrastructure/database/prisma-errors';
import type { FileRecord } from '../domain/file';
import type { FileRepository, NewFile } from '../domain/ports';

const FILE_SELECT = {
  id: true,
  organizationId: true,
  uploadedById: true,
  storageKey: true,
  filename: true,
  mimeType: true,
  size: true,
  status: true,
  failureReason: true,
  createdAt: true,
  uploadedAt: true,
} satisfies Prisma.FileSelect;

const OLDEST_FIRST = { createdAt: 'asc' } satisfies Prisma.FileOrderByWithRelationInput;

export class PrismaFileRepository implements FileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(file: NewFile): Promise<FileRecord> {
    return this.prisma.file.create({ data: file, select: FILE_SELECT });
  }

  findById(organizationId: string, id: string): Promise<FileRecord | null> {
    return this.prisma.file.findFirst({ where: { id, organizationId }, select: FILE_SELECT });
  }

  findMany(organizationId: string, ids: readonly string[]): Promise<FileRecord[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.file.findMany({
      where: { organizationId, id: { in: [...ids] } },
      select: FILE_SELECT,
    });
  }

  countPending(uploadedById: string, since: Date): Promise<number> {
    return this.prisma.file.count({
      where: { uploadedById, status: 'PENDING', createdAt: { gte: since } },
    });
  }

  markReady(id: string, at: Date): Promise<FileRecord | null> {
    return this.leavePending(id, { status: 'READY', uploadedAt: at });
  }

  markFailed(id: string, reason: string): Promise<FileRecord | null> {
    return this.leavePending(id, { status: 'FAILED', failureReason: reason.slice(0, 200) });
  }

  private async leavePending(id: string, data: Prisma.FileUpdateInput): Promise<FileRecord | null> {
    try {
      return await this.prisma.file.update({
        where: { id, status: 'PENDING' },
        data,
        select: FILE_SELECT,
      });
    } catch (err) {
      if (isRecordNotFound(err)) return null;
      throw err;
    }
  }

  listStalePending(before: Date, take: number): Promise<FileRecord[]> {
    return this.prisma.file.findMany({
      where: { status: 'PENDING', createdAt: { lt: before } },
      orderBy: OLDEST_FIRST,
      take,
      select: FILE_SELECT,
    });
  }

  listPurgeable(before: Date, take: number): Promise<FileRecord[]> {
    return this.prisma.file.findMany({
      where: {
        OR: [
          {
            status: 'READY',
            uploadedAt: { lt: before },
            postAttachments: { none: {} },
            messageAttachments: { none: {} },
          },
          { status: 'FAILED', createdAt: { lt: before } },
        ],
      },
      orderBy: OLDEST_FIRST,
      take,
      select: FILE_SELECT,
    });
  }

  async deleteUnreferenced(id: string): Promise<boolean> {
    try {
      await this.prisma.file.delete({ where: { id } });
      return true;
    } catch (err) {
      if (isForeignKeyViolation(err) || isRecordNotFound(err)) return false;
      throw err;
    }
  }
}
