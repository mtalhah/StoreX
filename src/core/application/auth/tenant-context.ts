import type { UserRole } from '@/core/domain/enums';
import type { Permission } from './permissions';

/**
 * The authorization context resolved once per request from the verified
 * WorkOS session. Every repository is constructed with a TenantContext and
 * injects its filters into every query — tenant isolation is structural, not
 * a per-endpoint convention.
 */
export interface TenantContext {
  organizationId: string;
  /** Internal user id (not the WorkOS id). */
  userId: string;
  email: string;
  role: UserRole;
  /**
   * This user's fully-resolved effective permissions — role baseline (fixed
   * for ADMIN, org-editable `RolePermission` rows for MANAGER/OPERATOR) with
   * any per-user `UserPermissionOverride` grants/revokes already applied.
   * Resolved once per request; `hasPermission`/`authorize` just check this.
   */
  permissions: Permission[];
  /** WorkOS user id of the current user, used as the inviter when this user sends a WorkOS invitation. Null if never linked to WorkOS. */
  workosUserId: string | null;
  /**
   * Warehouse ids this user may access.
   * `null` means unrestricted within the organization (Admins).
   * Managers get their assigned warehouses; Operators exactly one.
   */
  accessibleWarehouseIds: string[] | null;
}

export function canAccessWarehouse(ctx: TenantContext, warehouseId: string): boolean {
  return ctx.accessibleWarehouseIds === null || ctx.accessibleWarehouseIds.includes(warehouseId);
}
