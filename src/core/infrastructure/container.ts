import type { TenantContext } from '@/core/application/auth/tenant-context';
import type { AnalyticsRepository } from '@/core/application/ports/analytics-repository';
import type { AuthDirectory } from '@/core/application/ports/auth-directory';
import { AnalyticsService } from '@/core/application/services/analytics-service';
import { InventoryService } from '@/core/application/services/inventory-service';
import { PermissionsService } from '@/core/application/services/permissions-service';
import { StockMovementService } from '@/core/application/services/stock-movement-service';
import { UserService } from '@/core/application/services/user-service';
import { UserSyncService } from '@/core/application/services/user-sync-service';
import { WarehouseService } from '@/core/application/services/warehouse-service';
import { BigQueryAnalyticsRepository } from './analytics/bigquery-analytics-repository';
import { PostgresAnalyticsRepository } from './analytics/postgres-analytics-repository';
import { WorkosAuthDirectory } from './auth/workos-auth-directory';
import { prisma } from './db/prisma';
import { PrismaIdentityRepository } from './repositories/prisma-identity-repository';
import { PrismaInventoryRepository } from './repositories/prisma-inventory-repository';
import { PrismaPermissionRepository } from './repositories/prisma-permission-repository';
import { PrismaStockMovementRepository } from './repositories/prisma-stock-movement-repository';
import { PrismaUserRepository } from './repositories/prisma-user-repository';
import { PrismaWarehouseRepository } from './repositories/prisma-warehouse-repository';

/**
 * Composition root. Services (and the repositories inside them) are
 * constructed per request, bound to that request's TenantContext — the only
 * way to obtain a business service is through this factory, so no code path
 * can reach the persistence layer without a tenant scope.
 */
export interface Services {
  warehouses: WarehouseService;
  inventory: InventoryService;
  movements: StockMovementService;
  users: UserService;
  analytics: AnalyticsService;
  permissions: PermissionsService;
}

/**
 * `overrides.directory` exists solely so tests (the smoke test) can inject a
 * fake/failing AuthDirectory without touching real WorkOS or flipping
 * NODE_ENV (which would also change the analytics-repository production
 * gate below). Route handlers always call this with no overrides and get a
 * real WorkosAuthDirectory.
 */
export function createServices(ctx: TenantContext, overrides?: { directory?: AuthDirectory }): Services {
  const warehouseRepo = new PrismaWarehouseRepository(prisma, ctx);
  const inventoryRepo = new PrismaInventoryRepository(prisma, ctx);
  const movementRepo = new PrismaStockMovementRepository(prisma, ctx);
  const userRepo = new PrismaUserRepository(prisma, ctx);
  const permissionRepo = new PrismaPermissionRepository(prisma, ctx);
  const directory = overrides?.directory ?? new WorkosAuthDirectory();

  return {
    warehouses: new WarehouseService(ctx, warehouseRepo),
    inventory: new InventoryService(ctx, inventoryRepo, warehouseRepo),
    movements: new StockMovementService(ctx, movementRepo, inventoryRepo, warehouseRepo),
    users: new UserService(ctx, userRepo, directory),
    analytics: new AnalyticsService(ctx, createAnalyticsRepository(ctx)),
    permissions: new PermissionsService(ctx, permissionRepo, userRepo),
  };
}

function createAnalyticsRepository(ctx: TenantContext): AnalyticsRepository {
  const source = process.env.ANALYTICS_SOURCE ?? 'bigquery';
  if (source === 'postgres') {
    if (process.env.NODE_ENV === 'production') {
      // The dashboard must read from BigQuery in production; the Postgres
      // implementation exists purely for local development without GCP.
      throw new Error('ANALYTICS_SOURCE=postgres is not allowed in production.');
    }
    return new PostgresAnalyticsRepository(prisma, ctx);
  }
  return new BigQueryAnalyticsRepository(ctx);
}

/**
 * Sign-in / onboarding bootstrap service — the only consumer of the unscoped
 * identity repo and the WorkOS directory. WorkosAuthDirectory imports
 * `@workos-inc/authkit-nextjs` lazily, so referencing it here does not pull
 * that Next-only package into non-Next contexts (e.g. the tsx smoke test).
 */
export function createUserSyncService(): UserSyncService {
  return new UserSyncService(new PrismaIdentityRepository(prisma), new WorkosAuthDirectory());
}
