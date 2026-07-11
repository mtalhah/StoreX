import type { Prisma } from '@/generated/prisma/client';
import type { PrismaClient } from '../db/prisma';
import type { TenantContext } from '@/core/application/auth/tenant-context';
import type { Paginated } from '@/core/application/dto/common';
import { paginate } from '@/core/application/dto/common';
import type {
  CreateInventoryItemData,
  InventoryItemWithWarehouse,
  InventoryListQuery,
  InventoryRepository,
  UpdateInventoryItemData,
} from '@/core/application/ports/inventory-repository';
import type { InventoryItem } from '@/core/domain/entities';
import { ConflictError } from '@/core/domain/errors';
import { isUniqueConstraintViolation } from './prisma-errors';

type InventoryItemRow = Prisma.InventoryItemGetPayload<Record<string, never>>;

/**
 * Domain entities carry storageUnitsPerItem as a plain `number` (see the
 * Decimal-vs-Float trade-off note on the Prisma field) — Prisma returns it
 * as a Decimal instance, so every row crossing this boundary is converted
 * here rather than leaking decimal.js into the application layer.
 */
function toDomain(row: InventoryItemRow): InventoryItem {
  return { ...row, storageUnitsPerItem: row.storageUnitsPerItem.toNumber() };
}

export class PrismaInventoryRepository implements InventoryRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly ctx: TenantContext,
  ) {}

  private get scopedWhere(): Prisma.InventoryItemWhereInput {
    return {
      organizationId: this.ctx.organizationId,
      ...(this.ctx.accessibleWarehouseIds !== null
        ? { warehouseId: { in: this.ctx.accessibleWarehouseIds } }
        : {}),
    };
  }

  async findMany(query: InventoryListQuery): Promise<Paginated<InventoryItemWithWarehouse>> {
    const where: Prisma.InventoryItemWhereInput = {
      AND: [
        this.scopedWhere,
        // A warehouseId filter narrows *within* the scope: requesting an
        // inaccessible warehouse yields an empty page, never foreign data.
        query.warehouseId ? { warehouseId: query.warehouseId } : {},
        query.search
          ? {
              OR: [
                { sku: { contains: query.search, mode: 'insensitive' } },
                { name: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };

    const [rows, totalItems] = await Promise.all([
      this.db.inventoryItem.findMany({
        where,
        include: { warehouse: { select: { name: true } } },
        orderBy: { [query.sortBy]: query.sortDir },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.inventoryItem.count({ where }),
    ]);

    return paginate(
      rows.map(({ warehouse, ...item }) => ({ ...toDomain(item), warehouseName: warehouse.name })),
      totalItems,
      query,
    );
  }

  async findById(id: string): Promise<InventoryItemWithWarehouse | null> {
    const row = await this.db.inventoryItem.findFirst({
      where: { AND: [this.scopedWhere, { id }] },
      include: { warehouse: { select: { name: true } } },
    });
    if (!row) return null;
    const { warehouse, ...item } = row;
    return { ...toDomain(item), warehouseName: warehouse.name };
  }

  async create(data: CreateInventoryItemData): Promise<InventoryItem> {
    try {
      const row = await this.db.inventoryItem.create({
        data: {
          ...data,
          quantity: 0,
          organizationId: this.ctx.organizationId,
        },
      });
      return toDomain(row);
    } catch (e) {
      if (isUniqueConstraintViolation(e)) {
        throw new ConflictError(`SKU '${data.sku}' already exists in this warehouse.`);
      }
      throw e;
    }
  }

  async update(id: string, data: UpdateInventoryItemData): Promise<InventoryItem | null> {
    try {
      const result = await this.db.inventoryItem.updateMany({
        where: { AND: [this.scopedWhere, { id }] },
        data,
      });
      if (result.count === 0) return null;
      const row = await this.db.inventoryItem.findUnique({ where: { id } });
      return row ? toDomain(row) : null;
    } catch (e) {
      if (isUniqueConstraintViolation(e)) {
        throw new ConflictError(`SKU '${data.sku}' already exists in this warehouse.`);
      }
      throw e;
    }
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.inventoryItem.deleteMany({
      where: { AND: [this.scopedWhere, { id }] },
    });
    return result.count > 0;
  }

  /**
   * quantity * storageUnitsPerItem can't be aggregated server-side without
   * raw SQL (see PrismaWarehouseRepository.statsFor for the same trade-off),
   * so rows are loaded and reduced in JS.
   */
  async usedCapacityInWarehouse(warehouseId: string): Promise<number> {
    const items = await this.db.inventoryItem.findMany({
      where: { organizationId: this.ctx.organizationId, warehouseId },
      select: { quantity: true, storageUnitsPerItem: true },
    });
    return items.reduce((sum, i) => sum + i.quantity * i.storageUnitsPerItem.toNumber(), 0);
  }
}
