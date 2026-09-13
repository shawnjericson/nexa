import { Prisma } from '../../generated/prisma/client';

export function isUniqueViolation(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** A foreign key refused the write, e.g. deleting a row that is still referenced. */
export function isForeignKeyViolation(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003';
}

/** The record targeted by an update/delete did not match (e.g. it was deleted concurrently). */
export function isRecordNotFound(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}

/**
 * Best-effort text naming the violated unique constraint. The shape of `meta` differs between
 * query engines and driver adapters, so both the message and the metadata are included.
 */
export function describeUniqueViolation(err: Prisma.PrismaClientKnownRequestError): string {
  let meta = '';
  try {
    meta = JSON.stringify(err.meta ?? {});
  } catch {
    // circular metadata - the message alone is enough
  }
  return `${err.message} ${meta}`;
}
