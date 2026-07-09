import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

/**
 * Process-wide Prisma client (Prisma 7, pg driver adapter — no Rust engine).
 * Repositories receive this client but are individually constructed per
 * request with a TenantContext; the client itself holds no tenant state.
 *
 * The globalThis cache prevents connection-pool exhaustion from Next.js dev
 * hot reloads.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export type { PrismaClient };
