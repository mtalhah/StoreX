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
  /** Edit (quantity/note) and delete a previously recorded movement. Manager-only — see ROLE_PERMISSIONS. */
  MovementsManage: 'movements:manage',
  AnalyticsRead: 'analytics:read',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

/**
 * Default role → permission matrix, describing today's out-of-the-box
 * separation-of-duties model:
 *  - ADMIN owns the org structure (users, warehouses) and has read-only
 *    visibility into the operational data — admins do NOT record movements
 *    or edit inventory themselves. This list is also ADMIN's *permanent*
 *    permission set: unlike MANAGER/OPERATOR, ADMIN has no editable
 *    `RolePermission` rows and no per-user overrides apply to it (see
 *    `resolveEffectivePermissions`) — kept fixed so an org can never
 *    accidentally lock itself out of user management.
 *  - MANAGER and OPERATOR are both operational roles: they read + write
 *    inventory and stock movements for the warehouses they're assigned to,
 *    and read analytics scoped to those warehouses. They differ in
 *    warehouse assignment (operators are pinned to exactly one) and in
 *    whether the Warehouses section is shown (see `canViewWarehousesSection`)
 *    — and, by default, in `MovementsManage`: only MANAGER starts with the
 *    ability to edit or delete a previously recorded movement (correcting
 *    quantity/note on an existing ledger row, atomically re-deriving the
 *    item's materialized quantity — see StockMovementService.update/delete).
 *    An admin can customize either role's permissions (org-wide, via
 *    `RolePermission`) or grant/revoke exceptions for an individual person
 *    (via `UserPermissionOverride`) — this matrix is only the seed applied
 *    to a new organization and the fallback used to resolve `ADMIN`.
 *
 * WarehousesRead is granted to every role by default because the
 * inventory/movements UIs list warehouses to populate scoped dropdowns; the
 * list endpoint is already tenant/warehouse-scoped, so a non-admin only ever
 * sees their own warehouses. Visibility of the Warehouses *section* is a
 * separate rule.
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
    Permission.MovementsManage,
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

/**
 * Default permission list for a role — used to seed a new organization's
 * editable `RolePermission` rows and to resolve ADMIN (which is never
 * customizable; see `resolveEffectivePermissions`). Not the authorization
 * source of truth for MANAGER/OPERATOR once an org exists — `TenantContext`
 * carries the actually-resolved `permissions` for that.
 */
export function defaultPermissionsForRole(role: UserRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

/**
 * Combines a role's baseline permissions with per-user grant/revoke
 * exceptions into the final effective set. ADMIN ignores `rolePermissions`
 * entirely and always resolves to its fixed default list — ADMIN is not
 * editable at the role or per-user level (see UserPermissionOverride /
 * RolePermission schema comments for why: it's the one role that must never
 * be able to lock an organization out of user management).
 */
export function resolveEffectivePermissions(
  role: UserRole,
  rolePermissions: readonly Permission[],
  overrides: readonly { permission: Permission; effect: 'GRANT' | 'REVOKE' }[],
): Permission[] {
  const effective = new Set(role === 'ADMIN' ? ROLE_PERMISSIONS.ADMIN : rolePermissions);
  if (role !== 'ADMIN') {
    for (const override of overrides) {
      if (override.effect === 'GRANT') effective.add(override.permission);
      else effective.delete(override.permission);
    }
  }
  return [...effective];
}

/** Whether the context's resolved permission set includes `permission`. */
export function hasPermission(ctx: TenantContext, permission: Permission): boolean {
  return ctx.permissions.includes(permission);
}

/** Throws ForbiddenError when the context's role lacks the permission. */
export function authorize(ctx: TenantContext, permission: Permission): void {
  if (!hasPermission(ctx, permission)) {
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
