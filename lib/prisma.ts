import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

/**
 * Prisma connection pool configuration for Vercel serverless.
 *
 * For 50+ concurrent users on Vercel, use Supabase's connection pooler (PgBouncer):
 *   DATABASE_URL="postgresql://...@aws-0-xx.pooler.supabase.com:6543/postgres?pgbouncer=true"
 *
 * The `connection_limit=10` keeps each serverless instance lean.
 * Supabase pooler handles the actual pool across instances.
 */
function buildDatasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;

  // If already has connection_limit param, don't add
  if (url.includes('connection_limit')) return url;

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}connection_limit=10`;
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'production'
      ? ['error', 'warn']
      : ['query', 'error', 'warn'],
    datasourceUrl: buildDatasourceUrl(),
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
