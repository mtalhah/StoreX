import type { Prisma } from '@/generated/prisma/client';
import type { PrismaClient } from '../db/prisma';
import type { TenantContext } from '@/core/application/auth/tenant-context';
import type { Paginated } from '@/core/application/dto/common';
import { paginate } from '@/core/application/dto/common';
import type {
  CreateWarehouseData,
  UpdateWarehouseData,
  WarehouseListQuery,
  WarehouseRepository,
  WarehouseWithStats,
} from '@/core/application/ports/warehouse-repository';
import type { Warehouse } from '@/core/domain/entities';

/**
 * All queries are anchored on `scopedWhere`, which is derived from the
 * TenantContext at construction time. There is no code path that reads or
 * writes a warehouse outside the caller's organization and warehouse scope.
 */
export class PrismaWarehouseRepository implements WarehouseRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly ctx: TenantContext,
  ) {}

  private get scopedWhere(): Prisma.WarehouseWhereInput {
    return {
      organizationId: this.ctx.organizationId,
      ...(this.ctx.accessibleWarehouseIds !== null
        ? { id: { in: this.ctx.accessibleWarehouseIds } }
        : {}),
    };
  }

  async findMany(query: WarehouseListQuery): Promise<Paginated<WarehouseWithStats>> {
    const where: Prisma.WarehouseWhereInput = {
      AND: [
        this.scopedWhere,
        query.search ? { name: { startsWith: query.search, mode: 'insensitive' } } : {},
      ],
    };

    const [rows, totalItems] = await Promise.all([
      this.db.warehouse.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortDir },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.warehouse.count({ where }),
    ]);

    const stats = await this.statsFor(rows.map((r) => r.id));
    const items = rows.map((row) => ({
      ...row,
      totalQuantity: stats.get(row.id)?.totalQuantity ?? 0,
      usedCapacity: stats.get(row.id)?.usedCapacity ?? 0,
      skuCount: stats.get(row.id)?.skuCount ?? 0,
    }));

    return paginate(items, totalItems, query);
  }

  async findById(id: string): Promise<WarehouseWithStats | null> {
    const row = await this.db.warehouse.findFirst({ where: { AND: [this.scopedWhere, { id }] } });
    if (!row) return null;
    const stats = await this.statsFor([row.id]);
    return {
      ...row,
      totalQuantity: stats.get(row.id)?.totalQuantity ?? 0,
      usedCapacity: stats.get(row.id)?.usedCapacity ?? 0,
      skuCount: stats.get(row.id)?.skuCount ?? 0,
    };
  }

  async create(data: CreateWarehouseData): Promise<Warehouse> {
    return this.db.warehouse.create({
      data: { ...data, organizationId: this.ctx.organizationId },
    });
  }

  async update(id: string, data: UpdateWarehouseData): Promise<Warehouse | null> {
    // updateMany + scoped where keeps the write inside the tenant boundary;
    // Prisma's plain `update` would accept any id.
    const result = await this.db.warehouse.updateMany({
      where: { AND: [this.scopedWhere, { id }] },
      data,
    });
    if (result.count === 0) return null;
    return this.db.warehouse.findUnique({ where: { id } });
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.warehouse.deleteMany({
      where: { AND: [this.scopedWhere, { id }] },
    });
    return result.count > 0;
  }

  /**
   * usedCapacity is a per-row product (quantity * storageUnitsPerItem) that
   * Prisma's groupBy cannot aggregate server-side without raw SQL, so rows
   * are loaded and reduced in JS. Fine at this app's scale (a warehouse's
   * SKU count is realistically in the hundreds, not millions); totalQuantity
   * still comes along for free from the same rows.
   */
  private async statsFor(
    warehouseIds: string[],
  ): Promise<Map<string, { totalQuantity: number; usedCapacity: number; skuCount: number }>> {
    if (warehouseIds.length === 0) return new Map();
    const items = await this.db.inventoryItem.findMany({
      where: { warehouseId: { in: warehouseIds }, organizationId: this.ctx.organizationId },
      select: { warehouseId: true, quantity: true, storageUnitsPerItem: true },
    });

    const stats = new Map<string, { totalQuantity: number; usedCapacity: number; skuCount: number }>();
    for (const item of items) {
      const current = stats.get(item.warehouseId) ?? { totalQuantity: 0, usedCapacity: 0, skuCount: 0 };
      current.totalQuantity += item.quantity;
      current.usedCapacity += item.quantity * item.storageUnitsPerItem.toNumber();
      current.skuCount += 1;
      stats.set(item.warehouseId, current);
    }
    return stats;
  }
}
