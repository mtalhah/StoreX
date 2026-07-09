import type { Warehouse } from '@/core/domain/entities';
import type { Paginated, PageParams, SortDir } from '../dto/common';

export interface WarehouseWithStats extends Warehouse {
  /** Total units currently on hand across all SKUs. */
  totalQuantity: number;
  skuCount: number;
}

export type WarehouseSortField = 'name' | 'location' | 'capacity' | 'createdAt';

export interface WarehouseListQuery extends PageParams {
  sortBy: WarehouseSortField;
  sortDir: SortDir;
  search?: string;
}

export interface CreateWarehouseData {
  name: string;
  location: string;
  capacity: number;
}

export type UpdateWarehouseData = Partial<CreateWarehouseData>;

/**
 * Implementations MUST scope every operation to the TenantContext they were
 * constructed with (organization + accessible warehouses). Lookups outside
 * that scope behave as if the row does not exist.
 */
export interface WarehouseRepository {
  findMany(query: WarehouseListQuery): Promise<Paginated<WarehouseWithStats>>;
  findById(id: string): Promise<WarehouseWithStats | null>;
  create(data: CreateWarehouseData): Promise<Warehouse>;
  update(id: string, data: UpdateWarehouseData): Promise<Warehouse | null>;
  /** Returns false when the row is not visible in this context. */
  delete(id: string): Promise<boolean>;
}
