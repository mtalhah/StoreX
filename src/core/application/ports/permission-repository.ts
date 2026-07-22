import type { UserRole } from '@/core/domain/enums';
import type { Permission } from '../auth/permissions';

export interface PermissionOverride {
  permission: Permission;
  effect: 'GRANT' | 'REVOKE';
}

/**
 * Implementations MUST scope every operation to the TenantContext they were
 * constructed with. Role-permission rows are organization-wide (MANAGER and
 * OPERATOR only — ADMIN is never persisted here, see permissions.ts). User
 * override rows are written for a userId the caller has already validated
 * belongs to this organization (see PermissionsService).
 */
export interface PermissionRepository {
  getRolePermissions(role: UserRole): Promise<Permission[]>;
  /** Replaces the role's entire permission set for this organization. */
  setRolePermissions(role: UserRole, permissions: Permission[]): Promise<void>;
  getUserOverrides(userId: string): Promise<PermissionOverride[]>;
  /** Replaces the user's entire override set. */
  setUserOverrides(userId: string, overrides: PermissionOverride[]): Promise<void>;
}
