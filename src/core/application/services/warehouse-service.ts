import { BusinessRuleViolationError, NotFoundError, ValidationError } from '@/core/domain/errors';
import type { Warehouse } from '@/core/domain/entities';
import { authorize, Permission } from '../auth/permissions';
import type { TenantContext } from '../auth/tenant-context';
import type { Paginated } from '../dto/common';
import type {
  CreateWarehouseData,
  UpdateWarehouseData,
  WarehouseListQuery,
  WarehouseRepository,
  WarehouseWithStats,
} from '../ports/warehouse-repository';

export class WarehouseService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly warehouses: WarehouseRepository,
  ) {}

  async list(query: WarehouseListQuery): Promise<Paginated<WarehouseWithStats>> {
    authorize(this.ctx, Permission.WarehousesRead);
    return this.warehouses.findMany(query);
  }

  async get(id: string): Promise<WarehouseWithStats> {
    authorize(this.ctx, Permission.WarehousesRead);
    const warehouse = await this.warehouses.findById(id);
    if (!warehouse) throw new NotFoundError('Warehouse', id);
    return warehouse;
  }

  async create(data: CreateWarehouseData): Promise<Warehouse> {
    authorize(this.ctx, Permission.WarehousesManage);
    if (data.capacity <= 0) {
      throw new ValidationError('Capacity must be a positive number of units.');
    }
    return this.warehouses.create(data);
  }

  async update(id: string, data: UpdateWarehouseData): Promise<Warehouse> {
    authorize(this.ctx, Permission.WarehousesManage);
    const existing = await this.warehouses.findById(id);
    if (!existing) throw new NotFoundError('Warehouse', id);

    if (data.capacity !== undefined && data.capacity < existing.totalQuantity) {
      throw new BusinessRuleViolationError(
        `Capacity cannot be reduced below the ${existing.totalQuantity} units currently on hand.`,
      );
    }

    const updated = await this.warehouses.update(id, data);
    if (!updated) throw new NotFoundError('Warehouse', id);
    return updated;
  }

  async remove(id: string): Promise<void> {
    authorize(this.ctx, Permission.WarehousesManage);
    const existing = await this.warehouses.findById(id);
    if (!existing) throw new NotFoundError('Warehouse', id);

    if (existing.totalQuantity > 0) {
      throw new BusinessRuleViolationError(
        'Warehouses with stock on hand cannot be deleted. Move the stock out first.',
      );
    }

    const deleted = await this.warehouses.delete(id);
    if (!deleted) throw new NotFoundError('Warehouse', id);
  }
}
