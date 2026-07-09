import {
  BusinessRuleViolationError,
  NotFoundError,
  ValidationError,
} from '@/core/domain/errors';
import { authorize, Permission } from '../auth/permissions';
import type { TenantContext } from '../auth/tenant-context';
import type { Paginated } from '../dto/common';
import type {
  CreateUserData,
  UpdateUserData,
  UserListQuery,
  UserRepository,
  UserWithAssignments,
} from '../ports/user-repository';
import type { UserRole } from '@/core/domain/enums';

export class UserService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly users: UserRepository,
  ) {}

  async list(query: UserListQuery): Promise<Paginated<UserWithAssignments>> {
    authorize(this.ctx, Permission.UsersRead);
    return this.users.findMany(query);
  }

  async get(id: string): Promise<UserWithAssignments> {
    authorize(this.ctx, Permission.UsersRead);
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError('User', id);
    return user;
  }

  /**
   * Provisions a user inside the admin's organization. The user signs in via
   * WorkOS later; UserSyncService links the identity by email on first login.
   */
  async create(data: CreateUserData): Promise<UserWithAssignments> {
    authorize(this.ctx, Permission.UsersManage);
    await this.validateAssignments(data.role, data.warehouseIds);
    return this.users.create(data);
  }

  async update(id: string, data: UpdateUserData): Promise<UserWithAssignments> {
    authorize(this.ctx, Permission.UsersManage);
    const existing = await this.users.findById(id);
    if (!existing) throw new NotFoundError('User', id);

    if (id === this.ctx.userId && data.role !== undefined && data.role !== this.ctx.role) {
      throw new BusinessRuleViolationError('You cannot change your own role.');
    }

    const role = data.role ?? existing.role;
    const warehouseIds =
      data.warehouseIds ?? existing.warehouses.map((w) => w.id);
    await this.validateAssignments(role, warehouseIds);

    const updated = await this.users.update(id, { ...data, role, warehouseIds });
    if (!updated) throw new NotFoundError('User', id);
    return updated;
  }

  async remove(id: string): Promise<void> {
    authorize(this.ctx, Permission.UsersManage);
    if (id === this.ctx.userId) {
      throw new BusinessRuleViolationError('You cannot remove your own account.');
    }
    const deleted = await this.users.delete(id);
    if (!deleted) throw new NotFoundError('User', id);
  }

  /** Role/assignment invariants live here, in one place. */
  private async validateAssignments(role: UserRole, warehouseIds: string[]): Promise<void> {
    if (role === 'OPERATOR' && warehouseIds.length !== 1) {
      throw new ValidationError('Operators must be assigned to exactly one warehouse.');
    }
    if (role === 'MANAGER' && warehouseIds.length === 0) {
      throw new ValidationError('Managers must be assigned to at least one warehouse.');
    }
    if (role === 'ADMIN' && warehouseIds.length > 0) {
      throw new ValidationError('Admins have organization-wide access; do not assign warehouses.');
    }
    if (warehouseIds.length > 0) {
      const existing = await this.users.existingWarehouseIds(warehouseIds);
      const missing = warehouseIds.filter((id) => !existing.includes(id));
      if (missing.length > 0) {
        throw new NotFoundError('Warehouse', missing[0]);
      }
    }
  }
}
