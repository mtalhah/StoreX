import type { Prisma } from '@/generated/prisma/client';
import type { PrismaClient } from '../db/prisma';
import type { TenantContext } from '@/core/application/auth/tenant-context';
import type { Paginated } from '@/core/application/dto/common';
import { paginate } from '@/core/application/dto/common';
import type {
  MovementListQuery,
  RecordMovementData,
  StockMovementRepository,
  StockMovementWithRelations,
} from '@/core/application/ports/stock-movement-repository';
import { InsufficientStockError, NotFoundError } from '@/core/domain/errors';

const movementInclude = {
  inventoryItem: { select: { sku: true, name: true } },
  warehouse: { select: { name: true } },
  createdBy: { select: { firstName: true, lastName: true, email: true } },
} satisfies Prisma.StockMovementInclude;

type MovementRow = Prisma.StockMovementGetPayload<{ include: typeof movementInclude }>;

function toDto(row: MovementRow): StockMovementWithRelations {
  const { inventoryItem, warehouse, createdBy, ...movement } = row;
  const createdByName =
    [createdBy.firstName, createdBy.lastName].filter(Boolean).join(' ') || createdBy.email;
  return {
    ...movement,
    sku: inventoryItem.sku,
    itemName: inventoryItem.name,
    warehouseName: warehouse.name,
    createdByName,
  };
}

export class PrismaStockMovementRepository implements StockMovementRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly ctx: TenantContext,
  ) {}

  private get scopedWhere(): Prisma.StockMovementWhereInput {
    return {
      organizationId: this.ctx.organizationId,
      ...(this.ctx.accessibleWarehouseIds !== null
        ? { warehouseId: { in: this.ctx.accessibleWarehouseIds } }
        : {}),
    };
  }

  async findMany(query: MovementListQuery): Promise<Paginated<StockMovementWithRelations>> {
    const where: Prisma.StockMovementWhereInput = {
      AND: [
        this.scopedWhere,
        query.warehouseId ? { warehouseId: query.warehouseId } : {},
        query.inventoryItemId ? { inventoryItemId: query.inventoryItemId } : {},
        query.type ? { type: query.type } : {},
        query.from || query.to
          ? { occurredAt: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) } }
          : {},
      ],
    };

    const [rows, totalItems] = await Promise.all([
      this.db.stockMovement.findMany({
        where,
        include: movementInclude,
        orderBy: { [query.sortBy]: query.sortDir },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.stockMovement.count({ where }),
    ]);

    return paginate(rows.map(toDto), totalItems, query);
  }

  async applyMovement(data: RecordMovementData): Promise<StockMovementWithRelations> {
    const delta = data.type === 'INBOUND' ? data.quantity : -data.quantity;

    const row = await this.db.$transaction(async (tx) => {
      // Conditional update is the authoritative stock guard: for outbound the
      // WHERE clause requires enough stock, so a concurrent competing
      // movement can never drive the quantity negative. The scope filter is
      // part of the same WHERE — a foreign item is simply "not found".
      const guard = await tx.inventoryItem.updateMany({
        where: {
          AND: [
            {
              organizationId: this.ctx.organizationId,
              ...(this.ctx.accessibleWarehouseIds !== null
                ? { warehouseId: { in: this.ctx.accessibleWarehouseIds } }
                : {}),
            },
            { id: data.inventoryItemId },
            ...(delta < 0 ? [{ quantity: { gte: data.quantity } }] : []),
          ],
        },
        data: { quantity: { increment: delta } },
      });

      if (guard.count === 0) {
        const item = await tx.inventoryItem.findFirst({
          where: {
            AND: [
              {
                organizationId: this.ctx.organizationId,
                ...(this.ctx.accessibleWarehouseIds !== null
                  ? { warehouseId: { in: this.ctx.accessibleWarehouseIds } }
                  : {}),
              },
              { id: data.inventoryItemId },
            ],
          },
          select: { sku: true, quantity: true },
        });
        if (!item) throw new NotFoundError('Inventory item', data.inventoryItemId);
        throw new InsufficientStockError(item.sku, data.quantity, item.quantity);
      }

      return tx.stockMovement.create({
        data: {
          organizationId: this.ctx.organizationId,
          warehouseId: data.warehouseId,
          inventoryItemId: data.inventoryItemId,
          type: data.type,
          quantity: data.quantity,
          note: data.note ?? null,
          createdById: data.createdById,
        },
        include: movementInclude,
      });
    });

    return toDto(row);
  }
}
