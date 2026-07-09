import { Prisma } from '@/generated/prisma/client';

/** P2002 = unique constraint violation. */
export function isUniqueConstraintViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/** P2003 = foreign key constraint violation. */
export function isForeignKeyViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003';
}
