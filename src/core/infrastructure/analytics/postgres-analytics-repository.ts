import { ANALYTICS_THRESHOLDS } from '@/core/application/analytics-thresholds';
import type { TenantContext } from '@/core/application/auth/tenant-context';
import type {
  AnalyticsRepository,
  DashboardKpis,
  InventoryInsightRow,
  MovementTrendPoint,
  StockStatus,
  WarehouseUtilizationRow,
} from '@/core/application/ports/analytics-repository';
import type { Prisma } from '@/generated/prisma/client';
import type { PrismaClient } from '../db/prisma';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * LOCAL-DEVELOPMENT fallback (ANALYTICS_SOURCE=postgres) so the dashboard
 * works without a GCP project. Production always uses
 * BigQueryAnalyticsRepository — the container refuses the postgres source
 * when NODE_ENV=production. Classification logic mirrors the BigQuery SQL
 * and shares its thresholds.
 */
export class PostgresAnalyticsRepository implements AnalyticsRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly ctx: TenantContext,
  ) {}

  private get itemScope(): Prisma.InventoryItemWhereInput {
    return {
      organizationId: this.ctx.organizationId,
      ...(this.ctx.accessibleWarehouseIds !== null
        ? { warehouseId: { in: this.ctx.accessibleWarehouseIds } }
        : {}),
    };
  }

  private get movementScope(): Prisma.StockMovementWhereInput {
    return {
      organizationId: this.ctx.organizationId,
      ...(this.ctx.accessibleWarehouseIds !== null
        ? { warehouseId: { in: this.ctx.accessibleWarehouseIds } }
        : {}),
    };
  }

  private get warehouseScope(): Prisma.WarehouseWhereInput {
    return {
      organizationId: this.ctx.organizationId,
      ...(this.ctx.accessibleWarehouseIds !== null
        ? { id: { in: this.ctx.accessibleWarehouseIds } }
        : {}),
    };
  }

  async getKpis(): Promise<DashboardKpis> {
    const since30d = new Date(Date.now() - 30 * DAY_MS);

    // Loaded as rows (not aggregates) because every "total" here is a
    // per-row product — quantity * storageUnitsPerItem — which Prisma can't
    // sum server-side without raw SQL. totalStockUnits, inbound30d, and
    // outbound30d are all expressed in storage units for the same reason
    // utilizationPct is: 10 pallets moving through a warehouse is not the
    // same "amount" as 10 needles, so none of these may be a raw quantity
    // sum. movementVelocity30d is the one exception — it's a count of
    // movement events (cadence), not a quantity, so it's unaffected.
    const [items, capacity, movements30d, lowStock] = await Promise.all([
      this.db.inventoryItem.findMany({
        where: this.itemScope,
        select: { quantity: true, storageUnitsPerItem: true },
      }),
      this.db.warehouse.aggregate({ where: this.warehouseScope, _sum: { capacity: true } }),
      this.db.stockMovement.findMany({
        where: { ...this.movementScope, occurredAt: { gte: since30d } },
        select: {
          type: true,
          quantity: true,
          inventoryItem: { select: { storageUnitsPerItem: true } },
        },
      }),
      this.db.inventoryItem.count({
        where: { ...this.itemScope, quantity: { lte: ANALYTICS_THRESHOLDS.lowStockQty } },
      }),
    ]);

    const usedCapacity = items.reduce(
      (sum, i) => sum + i.quantity * i.storageUnitsPerItem.toNumber(),
      0,
    );
    const totalCapacity = capacity._sum.capacity ?? 0;
    const weightedFlow = (type: 'INBOUND' | 'OUTBOUND') =>
      movements30d
        .filter((m) => m.type === type)
        .reduce((sum, m) => sum + m.quantity * m.inventoryItem.storageUnitsPerItem.toNumber(), 0);

    return {
      totalStockUnits: usedCapacity,
      activeSkus: items.length,
      inbound30d: weightedFlow('INBOUND'),
      outbound30d: weightedFlow('OUTBOUND'),
      movementVelocity30d: Math.round((movements30d.length / 30) * 10) / 10,
      utilizationPct: totalCapacity > 0 ? (usedCapacity / totalCapacity) * 100 : 0,
      lowStockCount: lowStock,
    };
  }

  async getMovementTrend(days: number): Promise<MovementTrendPoint[]> {
    const start = new Date(Date.now() - (days - 1) * DAY_MS);
    start.setUTCHours(0, 0, 0, 0);

    // Storage-unit-weighted, same as inbound30d/outbound30d in getKpis() —
    // this chart is the day-by-day breakdown of the same measure.
    const movements = await this.db.stockMovement.findMany({
      where: { ...this.movementScope, occurredAt: { gte: start } },
      select: {
        type: true,
        quantity: true,
        occurredAt: true,
        inventoryItem: { select: { storageUnitsPerItem: true } },
      },
    });

    const buckets = new Map<string, { inbound: number; outbound: number }>();
    for (let i = 0; i < days; i++) {
      const date = new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10);
      buckets.set(date, { inbound: 0, outbound: 0 });
    }
    for (const m of movements) {
      const bucket = buckets.get(m.occurredAt.toISOString().slice(0, 10));
      if (!bucket) continue;
      const usedCapacityDelta = m.quantity * m.inventoryItem.storageUnitsPerItem.toNumber();
      if (m.type === 'INBOUND') bucket.inbound += usedCapacityDelta;
      else bucket.outbound += usedCapacityDelta;
    }

    return [...buckets.entries()].map(([date, v]) => ({ date, ...v }));
  }

  async getWarehouseUtilization(): Promise<WarehouseUtilizationRow[]> {
    const warehouses = await this.db.warehouse.findMany({
      where: this.warehouseScope,
      orderBy: { name: 'asc' },
    });
    // groupBy can't sum a computed product (quantity * storageUnitsPerItem),
    // so rows are loaded and reduced per warehouse in JS.
    const items = await this.db.inventoryItem.findMany({
      where: this.itemScope,
      select: { warehouseId: true, quantity: true, storageUnitsPerItem: true },
    });
    const itemsFor = (id: string) => items.filter((i) => i.warehouseId === id);

    return warehouses.map((w) => {
      const whItems = itemsFor(w.id);
      const usedCapacity = whItems.reduce(
        (sum, i) => sum + i.quantity * i.storageUnitsPerItem.toNumber(),
        0,
      );
      return {
        warehouseId: w.id,
        warehouseName: w.name,
        capacity: w.capacity,
        usedCapacity,
        skuCount: whItems.length,
        utilizationPct: w.capacity > 0 ? (usedCapacity / w.capacity) * 100 : 0,
      };
    });
  }

  async getInventoryInsights(): Promise<InventoryInsightRow[]> {
    const since30d = new Date(Date.now() - 30 * DAY_MS);
    const deadCutoff = new Date(Date.now() - ANALYTICS_THRESHOLDS.deadStockDays * DAY_MS);

    const [items, mv30, lastMv] = await Promise.all([
      this.db.inventoryItem.findMany({
        where: this.itemScope,
        include: { warehouse: { select: { name: true } } },
        orderBy: [{ warehouse: { name: 'asc' } }, { sku: 'asc' }],
      }),
      this.db.stockMovement.groupBy({
        by: ['inventoryItemId', 'type'],
        where: { ...this.movementScope, occurredAt: { gte: since30d } },
        _sum: { quantity: true },
      }),
      this.db.stockMovement.groupBy({
        by: ['inventoryItemId'],
        where: this.movementScope,
        _max: { occurredAt: true },
      }),
    ]);

    const flow = (itemId: string, type: 'INBOUND' | 'OUTBOUND') =>
      mv30.find((m) => m.inventoryItemId === itemId && m.type === type)?._sum.quantity ?? 0;
    const lastFor = (itemId: string) =>
      lastMv.find((m) => m.inventoryItemId === itemId)?._max.occurredAt ?? null;

    return items.map((item) => {
      const inbound30d = flow(item.id, 'INBOUND');
      const outbound30d = flow(item.id, 'OUTBOUND');
      const lastMovementAt = lastFor(item.id);

      let status: StockStatus = 'HEALTHY';
      if (item.quantity <= ANALYTICS_THRESHOLDS.lowStockQty) status = 'LOW_STOCK';
      else if (!lastMovementAt || lastMovementAt < deadCutoff) status = 'DEAD_STOCK';
      else if (outbound30d >= ANALYTICS_THRESHOLDS.fastMoverOutbound30d) status = 'FAST_MOVER';

      return {
        warehouseId: item.warehouseId,
        warehouseName: item.warehouse.name,
        sku: item.sku,
        itemName: item.name,
        quantity: item.quantity,
        inbound30d,
        outbound30d,
        lastMovementAt: lastMovementAt ? lastMovementAt.toISOString() : null,
        status,
      };
    });
  }
}
