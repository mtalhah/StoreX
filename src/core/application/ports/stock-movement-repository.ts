import type { StockMovement } from '@/core/domain/entities';
import type { MovementType } from '@/core/domain/enums';
import type { Paginated, PageParams, SortDir } from '../dto/common';

export interface StockMovementWithRelations extends StockMovement {
  sku: string;
  itemName: string;
  warehouseName: string;
  createdByName: string;
}

export type MovementSortField = 'occurredAt' | 'quantity' | 'type';

export interface MovementListQuery extends PageParams {
  sortBy: MovementSortField;
  sortDir: SortDir;
  warehouseId?: string;
  inventoryItemId?: string;
  type?: MovementType;
  from?: Date;
  to?: Date;
}

export interface RecordMovementData {
  inventoryItemId: string;
  warehouseId: string;
  type: MovementType;
  quantity: number;
  note?: string;
  createdById: string;
}

/** Tenant- and warehouse-scoped; see WarehouseRepository contract note. */
export interface StockMovementRepository {
  findMany(query: MovementListQuery): Promise<Paginated<StockMovementWithRelations>>;
  /**
   * Atomically inserts the movement row and adjusts the materialized item
   * quantity in one transaction. The quantity update is conditional
   * (`quantity >= qty` for outbound), so overselling is impossible even under
   * concurrent requests; implementations throw InsufficientStockError when
   * the guard fails. Business validation (capacity, item existence, signs)
   * belongs to StockMovementService — this method only guarantees atomicity
   * and the non-negative invariant.
   */
  applyMovement(data: RecordMovementData): Promise<StockMovementWithRelations>;
}
