import { ForbiddenError } from '@/core/domain/errors';
import type { UserRole } from '@/core/domain/enums';
import type { TenantContext } from './tenant-context';

/**
 * Declarative role → permission matrix. Kept independent of business logic:
 * services call `authorize()` as a guard, route handlers declare their
 * required permission, and the UI derives nav visibility from the same table
 * (UI hiding is a convenience, never the enforcement point).
 */
export const Permission = {
  UsersManage: 'users:manage',
  UsersRead: 'users:read',
  WarehousesManage: 'warehouses:manage',
  WarehousesRead: 'warehouses:read',
  InventoryManage: 'inventory:manage',
  InventoryRead: 'inventory:read',
  MovementsCreate: 'movements:create',
  MovementsRead: 'movements:read',
  AnalyticsRead: 'analytics:read',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

/**
 * Role → permission matrix. Deliberately a separation-of-duties model:
 *  - ADMIN owns the org structure (users, warehouses) and has read-only
 *    visibility into the operational data — admins do NOT record movements
 *    or edit inventory themselves.
 *  - MANAGER and OPERATOR are the operational roles: they read + write
 *    inventory and stock movements for the warehouses they're assigned to,
 *    and read analytics scoped to those warehouses. Their permission SETS
 *    are identical; they differ only in warehouse assignment (operators are
 *    pinned to exactly one) and in whether the Warehouses section is shown
 *    (see `canViewWarehousesSection`).
 *
 * WarehousesRead is granted to every role because the inventory/movements
 * UIs list warehouses to populate scoped dropdowns; the list endpoint is
 * already tenant/warehouse-scoped, so a non-admin only ever sees their own
 * warehouses. Visibility of the Warehouses *section* is a separate rule.
 */
const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  ADMIN: [
    Permission.UsersManage,
    Permission.UsersRead,
    Permission.WarehousesManage,
    Permission.WarehousesRead,
    Permission.InventoryRead,
    Permission.MovementsRead,
    Permission.AnalyticsRead,
  ],
  MANAGER: [
    Permission.WarehousesRead,
    Permission.InventoryManage,
    Permission.InventoryRead,
    Permission.MovementsCreate,
    Permission.MovementsRead,
    Permission.AnalyticsRead,
  ],
  OPERATOR: [
    Permission.WarehousesRead,
    Permission.InventoryManage,
    Permission.InventoryRead,
    Permission.MovementsCreate,
    Permission.MovementsRead,
    Permission.AnalyticsRead,
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Throws ForbiddenError when the context's role lacks the permission. */
export function authorize(ctx: TenantContext, permission: Permission): void {
  if (!hasPermission(ctx.role, permission)) {
    throw new ForbiddenError();
  }
}

/**
 * Whether the Warehouses section (nav item + `/warehouses` page) is shown.
 * Not a plain permission because the Manager case depends on how many
 * warehouses the user is assigned to, not just their role:
 *  - ADMIN: always (org-wide management).
 *  - MANAGER: only when assigned to more than one warehouse (a single-warehouse
 *    manager has nothing to switch between, so the section is hidden).
 *  - OPERATOR: never.
 *
 * This gates UI/navigation only. Data access to warehouses is still enforced
 * by `WarehousesRead` at the API layer and by scoping in the repositories.
 */
export function canViewWarehousesSection(ctx: TenantContext): boolean {
  if (ctx.role === 'ADMIN') return true;
  if (ctx.role === 'MANAGER') return (ctx.accessibleWarehouseIds?.length ?? 0) > 1;
  return false;
}
