import { BusinessRuleViolationError, NotFoundError, ValidationError } from '@/core/domain/errors';
import type { InventoryItem } from '@/core/domain/entities';
import { authorize, Permission } from '../auth/permissions';
import type { TenantContext } from '../auth/tenant-context';
import type { Paginated } from '../dto/common';
import type {
  CreateInventoryItemData,
  InventoryItemWithWarehouse,
  InventoryListQuery,
  InventoryRepository,
  UpdateInventoryItemData,
} from '../ports/inventory-repository';
import type { WarehouseRepository } from '../ports/warehouse-repository';

export class InventoryService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly inventory: InventoryRepository,
    private readonly warehouses: WarehouseRepository,
  ) {}

  async list(query: InventoryListQuery): Promise<Paginated<InventoryItemWithWarehouse>> {
    authorize(this.ctx, Permission.InventoryRead);
    return this.inventory.findMany(query);
  }

  async get(id: string): Promise<InventoryItemWithWarehouse> {
    authorize(this.ctx, Permission.InventoryRead);
    const item = await this.inventory.findById(id);
    if (!item) throw new NotFoundError('Inventory item', id);
    return item;
  }

  async create(data: CreateInventoryItemData): Promise<InventoryItem> {
    authorize(this.ctx, Permission.InventoryManage);
    // Authoritative existence + scope check: WarehouseRepository.findById is
    // itself tenant- and warehouse-scoped, so this returns null both for a
    // warehouse in a foreign organization and for one outside this role's
    // assigned warehouses. Without this, an Admin's unrestricted scope
    // (accessibleWarehouseIds === null) would let any warehouseId through,
    // creating an inventory_items row whose organizationId/warehouseId pair
    // don't actually belong together.
    const warehouse = await this.warehouses.findById(data.warehouseId);
    if (!warehouse) throw new NotFoundError('Warehouse', data.warehouseId);

    if (data.storageUnitsPerItem !== undefined && data.storageUnitsPerItem <= 0) {
      throw new ValidationError('Storage units per item must be positive.');
    }

    return this.inventory.create(data);
  }

  async update(id: string, data: UpdateInventoryItemData): Promise<InventoryItem> {
    authorize(this.ctx, Permission.InventoryManage);
    if (data.storageUnitsPerItem !== undefined && data.storageUnitsPerItem <= 0) {
      throw new ValidationError('Storage units per item must be positive.');
    }
    const updated = await this.inventory.update(id, data);
    if (!updated) throw new NotFoundError('Inventory item', id);
    return updated;
  }

  async remove(id: string): Promise<void> {
    authorize(this.ctx, Permission.InventoryManage);
    const existing = await this.inventory.findById(id);
    if (!existing) throw new NotFoundError('Inventory item', id);

    if (existing.quantity > 0) {
      throw new BusinessRuleViolationError(
        `${existing.sku} still has ${existing.quantity} units on hand. Record outbound movements before deleting it.`,
      );
    }

    const deleted = await this.inventory.delete(id);
    if (!deleted) throw new NotFoundError('Inventory item', id);
  }
}
