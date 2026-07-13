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

export interface UpdateMovementInput {
  quantity?: number;
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
      const usedCapacity = await this.inventory.usedCapacityInWarehouse(item.warehouseId);
      const requiredCapacity = input.quantity * item.storageUnitsPerItem;
      const remaining = warehouse.capacity - usedCapacity;
      if (requiredCapacity > remaining) {
        // Capacity is a soft business constraint checked outside the write
        // transaction; a concurrent inbound can slightly overshoot. That
        // trade-off (documented in the README) avoids serializable
        // transactions on the hottest write path.
        throw new CapacityExceededError(warehouse.name, requiredCapacity, Math.max(0, remaining));
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

  async update(id: string, input: UpdateMovementInput): Promise<StockMovementWithRelations> {
    authorize(this.ctx, Permission.MovementsManage);

    if (input.quantity === undefined && input.note === undefined) {
      throw new ValidationError('At least one field must be provided.');
    }
    if (input.quantity !== undefined && (!Number.isInteger(input.quantity) || input.quantity <= 0)) {
      throw new ValidationError('Movement quantity must be a positive whole number.');
    }

    const existing = await this.movements.findById(id);
    if (!existing) throw new NotFoundError('Stock movement', id);

    if (input.quantity !== undefined && input.quantity !== existing.quantity) {
      // Net effect on the item's quantity, same sign convention as record():
      // positive means this edit adds to what's on hand (a bigger inbound or
      // a smaller outbound) and needs the same soft capacity pre-check as an
      // inbound; the "don't go negative" case is the repository's atomic
      // guard, not this one.
      const signedOld = existing.type === 'INBOUND' ? existing.quantity : -existing.quantity;
      const signedNew = existing.type === 'INBOUND' ? input.quantity : -input.quantity;
      const delta = signedNew - signedOld;

      if (delta > 0) {
        const item = await this.inventory.findById(existing.inventoryItemId);
        if (!item) throw new NotFoundError('Inventory item', existing.inventoryItemId);
        const warehouse = await this.warehouses.findById(existing.warehouseId);
        if (!warehouse) throw new NotFoundError('Warehouse', existing.warehouseId);
        const usedCapacity = await this.inventory.usedCapacityInWarehouse(existing.warehouseId);
        const requiredCapacity = delta * item.storageUnitsPerItem;
        const remaining = warehouse.capacity - usedCapacity;
        if (requiredCapacity > remaining) {
          throw new CapacityExceededError(warehouse.name, requiredCapacity, Math.max(0, remaining));
        }
      }
    }

    return this.movements.updateMovement(id, input);
  }

  async delete(id: string): Promise<void> {
    authorize(this.ctx, Permission.MovementsManage);

    const existing = await this.movements.findById(id);
    if (!existing) throw new NotFoundError('Stock movement', id);

    if (existing.type === 'OUTBOUND') {
      // Deleting an outbound gives its quantity back — same soft capacity
      // pre-check as an inbound record/increase; the "don't go negative"
      // case (deleting an inbound) is the repository's atomic guard.
      const item = await this.inventory.findById(existing.inventoryItemId);
      if (!item) throw new NotFoundError('Inventory item', existing.inventoryItemId);
      const warehouse = await this.warehouses.findById(existing.warehouseId);
      if (!warehouse) throw new NotFoundError('Warehouse', existing.warehouseId);
      const usedCapacity = await this.inventory.usedCapacityInWarehouse(existing.warehouseId);
      const requiredCapacity = existing.quantity * item.storageUnitsPerItem;
      const remaining = warehouse.capacity - usedCapacity;
      if (requiredCapacity > remaining) {
        throw new CapacityExceededError(warehouse.name, requiredCapacity, Math.max(0, remaining));
      }
    }

    await this.movements.deleteMovement(id);
  }
}
