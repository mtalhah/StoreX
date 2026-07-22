import type { InventoryItem } from '@/core/domain/entities';
import type { Paginated, PageParams, SortDir } from '../dto/common';

export interface InventoryItemWithWarehouse extends InventoryItem {
  warehouseName: string;
}

export type InventorySortField =
  | 'sku'
  | 'name'
  | 'quantity'
  | 'storageUnitsPerItem'
  | 'totalStorageUnits'
  | 'updatedAt';

export interface InventoryListQuery extends PageParams {
  sortBy: InventorySortField;
  sortDir: SortDir;
  search?: string;
  warehouseId?: string;
}

export interface CreateInventoryItemData {
  warehouseId: string;
  sku: string;
  name: string;
  /** Canonical value; omit to accept the schema default (1). */
  storageUnitsPerItem?: number;
}

export interface UpdateInventoryItemData {
  sku?: string;
  name?: string;
  storageUnitsPerItem?: number;
}

/** Tenant- and warehouse-scoped; see WarehouseRepository contract note. */
export interface InventoryRepository {
  findMany(query: InventoryListQuery): Promise<Paginated<InventoryItemWithWarehouse>>;
  findById(id: string): Promise<InventoryItemWithWarehouse | null>;
  /** Quantity always starts at 0 — stock only enters through movements. */
  create(data: CreateInventoryItemData): Promise<InventoryItem>;
  update(id: string, data: UpdateInventoryItemData): Promise<InventoryItem | null>;
  delete(id: string): Promise<boolean>;
  /** Storage units currently consumed in a warehouse: sum(quantity * storageUnitsPerItem). */
  usedCapacityInWarehouse(warehouseId: string): Promise<number>;
}
