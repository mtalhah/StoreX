import {
  CapacityExceededError,
  InsufficientStockError,
  NotFoundError,
  ValidationError,
} from '@/core/domain/errors';
import { authorize, Permission } from '../auth/permissions';
import type { TenantContext } from '../auth/tenant-context';
import type { Paginated } from '../dto/common';
import type { InventoryRepository } from '../ports/inventory-repository';
import type {
  MovementListQuery,
  StockMovementRepository,
  StockMovementWithRelations,
} from '../ports/stock-movement-repository';
import type { WarehouseRepository } from '../ports/warehouse-repository';

export interface RecordMovementInput {
  inventoryItemId: string;
  type: 'INBOUND' | 'OUTBOUND';
  quantity: number;
  note?: string;
}

/**
 * The single write path for stock levels. Inventory quantities are never
 * mutated directly anywhere else — they are derived here, from movements,
 * and persisted atomically by the repository.
 */
export class StockMovementService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly movements: StockMovementRepository,
    private readonly inventory: InventoryRepository,
    private readonly warehouses: WarehouseRepository,
  ) {}

  async list(query: MovementListQuery): Promise<Paginated<StockMovementWithRelations>> {
    authorize(this.ctx, Permission.MovementsRead);
    return this.movements.findMany(query);
  }

  async record(input: RecordMovementInput): Promise<StockMovementWithRelations> {
    authorize(this.ctx, Permission.MovementsCreate);

    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new ValidationError('Movement quantity must be a positive whole number.');
    }

    // Scoped lookup: an item in another tenant or outside the caller's
    // warehouses is simply "not found".
    const item = await this.inventory.findById(input.inventoryItemId);
    if (!item) throw new NotFoundError('Inventory item', input.inventoryItemId);

    if (input.type === 'OUTBOUND' && item.quantity < input.quantity) {
      // Fast, friendly pre-check. The authoritative guard is the conditional
      // update inside applyMovement, which also wins races.
      throw new InsufficientStockError(item.sku, input.quantity, item.quantity);
    }

    if (input.type === 'INBOUND') {
      const warehouse = await this.warehouses.findById(item.warehouseId);
      if (!warehouse) throw new NotFoundError('Warehouse', item.warehouseId);
      const used = await this.inventory.totalQuantityInWarehouse(item.warehouseId);
      const remaining = warehouse.capacity - used;
      if (input.quantity > remaining) {
        // Capacity is a soft business constraint checked outside the write
        // transaction; a concurrent inbound can slightly overshoot. That
        // trade-off (documented in the README) avoids serializable
        // transactions on the hottest write path.
        throw new CapacityExceededError(warehouse.name, input.quantity, Math.max(0, remaining));
      }
    }

    return this.movements.applyMovement({
      inventoryItemId: item.id,
      warehouseId: item.warehouseId,
      type: input.type,
      quantity: input.quantity,
      note: input.note,
      createdById: this.ctx.userId,
    });
  }
}
