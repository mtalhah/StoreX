import type { User } from '@/core/domain/entities';
import type { UserRole } from '@/core/domain/enums';
import type { Paginated, PageParams, SortDir } from '../dto/common';

export interface UserWithAssignments extends User {
  warehouses: Array<{ id: string; name: string }>;
}

export type UserSortField = 'email' | 'role' | 'createdAt';

export interface UserListQuery extends PageParams {
  sortBy: UserSortField;
  sortDir: SortDir;
  search?: string;
  role?: UserRole;
}

export interface CreateUserData {
  email: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  warehouseIds: string[];
}

export interface UpdateUserData {
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  warehouseIds?: string[];
  isActive?: boolean;
}

/** Tenant-scoped (organization-wide; user management is Admin-only). */
export interface UserRepository {
  findMany(query: UserListQuery): Promise<Paginated<UserWithAssignments>>;
  findById(id: string): Promise<UserWithAssignments | null>;
  create(data: CreateUserData): Promise<UserWithAssignments>;
  update(id: string, data: UpdateUserData): Promise<UserWithAssignments | null>;
  delete(id: string): Promise<boolean>;
  /** Warehouse ids (within the tenant) that actually exist, for validation. */
  existingWarehouseIds(ids: string[]): Promise<string[]>;
}
