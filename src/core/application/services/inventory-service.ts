import { BusinessRuleViolationError, NotFoundError } from '@/core/domain/errors';
import type { InventoryItem } from '@/core/domain/entities';
import { authorize, Permission } from '../auth/permissions';
import { canAccessWarehouse, type TenantContext } from '../auth/tenant-context';
import type { Paginated } from '../dto/common';
import type {
  CreateInventoryItemData,
  InventoryItemWithWarehouse,
  InventoryListQuery,
  InventoryRepository,
  UpdateInventoryItemData,
} from '../ports/inventory-repository';

export class InventoryService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly inventory: InventoryRepository,
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
    // The repository is warehouse-scoped anyway; this explicit check exists
    // so an out-of-scope warehouse reads as "not found" before we attempt a
    // write that would violate the FK.
    if (!canAccessWarehouse(this.ctx, data.warehouseId)) {
      throw new NotFoundError('Warehouse', data.warehouseId);
    }
    return this.inventory.create(data);
  }

  async update(id: string, data: UpdateInventoryItemData): Promise<InventoryItem> {
    authorize(this.ctx, Permission.InventoryManage);
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
