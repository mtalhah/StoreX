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
  UpdateMovementData,
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
    // `to` is a calendar date (midnight); treat it as inclusive of that whole day.
    const toInclusive = query.to
      ? new Date(query.to.getTime() + 24 * 60 * 60 * 1000 - 1)
      : undefined;

    const where: Prisma.StockMovementWhereInput = {
      AND: [
        this.scopedWhere,
        query.warehouseId ? { warehouseId: query.warehouseId } : {},
        query.inventoryItemId ? { inventoryItemId: query.inventoryItemId } : {},
        query.type ? { type: query.type } : {},
        query.from || toInclusive
          ? { occurredAt: { ...(query.from && { gte: query.from }), ...(toInclusive && { lte: toInclusive }) } }
          : {},
        query.quantityMin !== undefined || query.quantityMax !== undefined
          ? {
              quantity: {
                ...(query.quantityMin !== undefined && { gte: query.quantityMin }),
                ...(query.quantityMax !== undefined && { lte: query.quantityMax }),
              },
            }
          : {},
        query.search
          ? {
              inventoryItem: {
                OR: [
                  { sku: { contains: query.search, mode: 'insensitive' } },
                  { name: { contains: query.search, mode: 'insensitive' } },
                ],
              },
            }
          : {},
        query.recordedBy
          ? {
              createdBy: {
                OR: [
                  { firstName: { contains: query.recordedBy, mode: 'insensitive' } },
                  { lastName: { contains: query.recordedBy, mode: 'insensitive' } },
                  { email: { contains: query.recordedBy, mode: 'insensitive' } },
                ],
              },
            }
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

  async findById(id: string): Promise<StockMovementWithRelations | null> {
    const row = await this.db.stockMovement.findFirst({
      where: { id, ...this.scopedWhere },
      include: movementInclude,
    });
    return row ? toDto(row) : null;
  }

  async applyMovement(data: RecordMovementData): Promise<StockMovementWithRelations> {
    const delta = data.type === 'INBOUND' ? data.quantity : -data.quantity;

    const row = await this.db.$transaction(async (tx) => {
      // Conditional update is the authoritative stock guard: for outbound the
      // WHERE clause requires enough stock, so a concurrent competing
      // movement can never drive the quantity negative. The scope filter is
      // part of the same WHERE — a foreign item is simply "not found". The
      // exact-match on warehouseId additionally guards the stock_movements
      // row we're about to insert: if a caller ever passed a warehouseId
      // that doesn't actually match this item's warehouse (data.warehouseId
      // is always service-derived from the item today, so this is
      // defense-in-depth, not a reachable path), the update matches zero
      // rows and the movement is never recorded with mismatched columns.
      const guard = await tx.inventoryItem.updateMany({
        where: {
          AND: [
            {
              organizationId: this.ctx.organizationId,
              ...(this.ctx.accessibleWarehouseIds !== null
                ? { warehouseId: { in: this.ctx.accessibleWarehouseIds } }
                : {}),
            },
            { id: data.inventoryItemId, warehouseId: data.warehouseId },
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

  async updateMovement(
    id: string,
    patch: UpdateMovementData,
  ): Promise<StockMovementWithRelations> {
    const row = await this.db.$transaction(async (tx) => {
      const existing = await tx.stockMovement.findFirst({ where: { id, ...this.scopedWhere } });
      if (!existing) throw new NotFoundError('Stock movement', id);

      if (patch.quantity !== undefined && patch.quantity !== existing.quantity) {
        // Re-deriving the aggregate for a quantity edit: the item's quantity
        // currently reflects the OLD signed amount (+old for inbound, -old
        // for outbound); moving it to reflect the NEW signed amount is just
        // the delta between the two — same conditional-update guard as
        // applyMovement so a concurrent movement can never be raced negative.
        const signedOld = existing.type === 'INBOUND' ? existing.quantity : -existing.quantity;
        const signedNew = existing.type === 'INBOUND' ? patch.quantity : -patch.quantity;
        const delta = signedNew - signedOld;

        const guard = await tx.inventoryItem.updateMany({
          where: {
            AND: [{ id: existing.inventoryItemId }, ...(delta < 0 ? [{ quantity: { gte: -delta } }] : [])],
          },
          data: { quantity: { increment: delta } },
        });
        if (guard.count === 0) {
          const item = await tx.inventoryItem.findUnique({
            where: { id: existing.inventoryItemId },
            select: { sku: true, quantity: true },
          });
          throw new InsufficientStockError(item?.sku ?? existing.inventoryItemId, -delta, item?.quantity ?? 0);
        }
      }

      return tx.stockMovement.update({
        where: { id },
        data: {
          ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
          ...(patch.note !== undefined ? { note: patch.note || null } : {}),
        },
        include: movementInclude,
      });
    });

    return toDto(row);
  }

  async deleteMovement(id: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const existing = await tx.stockMovement.findFirst({ where: { id, ...this.scopedWhere } });
      if (!existing) throw new NotFoundError('Stock movement', id);

      // Reversing the movement's effect: removing an INBOUND takes quantity
      // back down (guarded, same as an outbound record — later movements may
      // have already consumed that stock); removing an OUTBOUND gives
      // quantity back (unguarded here — capacity is a soft pre-check owned by
      // the service, same division of labor as applyMovement/updateMovement).
      const delta = existing.type === 'INBOUND' ? -existing.quantity : existing.quantity;

      if (delta < 0) {
        const guard = await tx.inventoryItem.updateMany({
          where: { id: existing.inventoryItemId, quantity: { gte: -delta } },
          data: { quantity: { increment: delta } },
        });
        if (guard.count === 0) {
          const item = await tx.inventoryItem.findUnique({
            where: { id: existing.inventoryItemId },
            select: { sku: true, quantity: true },
          });
          throw new InsufficientStockError(item?.sku ?? existing.inventoryItemId, -delta, item?.quantity ?? 0);
        }
      } else {
        await tx.inventoryItem.update({
          where: { id: existing.inventoryItemId },
          data: { quantity: { increment: delta } },
        });
      }

      await tx.stockMovement.delete({ where: { id } });
    });
  }
}
