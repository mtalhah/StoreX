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
  /** Matches the movement's SKU or item name (contains, case-insensitive). */
  search?: string;
  warehouseId?: string;
  inventoryItemId?: string;
  type?: MovementType;
  from?: Date;
  to?: Date;
  quantityMin?: number;
  quantityMax?: number;
  /** Matches the recording user's name or email (contains, case-insensitive). */
  recordedBy?: string;
}

export interface RecordMovementData {
  inventoryItemId: string;
  warehouseId: string;
  type: MovementType;
  quantity: number;
  note?: string;
  createdById: string;
}

export interface UpdateMovementData {
  quantity?: number;
  note?: string;
}

/** Tenant- and warehouse-scoped; see WarehouseRepository contract note. */
export interface StockMovementRepository {
  findMany(query: MovementListQuery): Promise<Paginated<StockMovementWithRelations>>;
  findById(id: string): Promise<StockMovementWithRelations | null>;
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
  /**
   * Atomically re-derives the item's materialized quantity for the delta
   * between the movement's old and new quantity, then updates the movement
   * row, in one transaction — same non-negative guard and same division of
   * labor as `applyMovement` (capacity re-checks belong to the service).
   * Throws NotFoundError / InsufficientStockError.
   */
  updateMovement(id: string, patch: UpdateMovementData): Promise<StockMovementWithRelations>;
  /**
   * Atomically reverses the movement's effect on the item's materialized
   * quantity and deletes the row, in one transaction. Throws NotFoundError /
   * InsufficientStockError (deleting an INBOUND that later movements already
   * consumed would drive quantity negative).
   */
  deleteMovement(id: string): Promise<void>;
}
