import type { User } from '@/core/domain/entities';
import type { InvitationStatus, UserRole } from '@/core/domain/enums';
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

/** What the route/API supplies when an admin provisions a user. */
export interface CreateUserInput {
  email: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  warehouseIds: string[];
}

/**
 * Persistence-complete shape: CreateUserInput plus the WorkOS invitation
 * outcome UserService computed by calling AuthDirectory before persisting.
 */
export interface CreateUserData extends CreateUserInput {
  workosInvitationId: string | null;
  invitationStatus: InvitationStatus;
  invitedAt: Date | null;
}

export interface UpdateUserData {
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  warehouseIds?: string[];
  isActive?: boolean;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  workosOrgId: string | null;
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
  /** The tenant's org summary (name + WorkOS link), for sending invitations. */
  getOrganization(): Promise<OrganizationSummary>;
}
