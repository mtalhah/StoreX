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

const ALL_PERMISSIONS = Object.values(Permission);

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  ADMIN: ALL_PERMISSIONS,
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
    Permission.InventoryRead,
    Permission.MovementsCreate,
    Permission.MovementsRead,
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
