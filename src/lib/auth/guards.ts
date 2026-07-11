import 'server-only';
import { redirect } from 'next/navigation';
import {
  canViewWarehousesSection,
  hasPermission,
  type Permission,
} from '@/core/application/auth/permissions';
import type { TenantContext } from '@/core/application/auth/tenant-context';
import { getTenantContext } from './session';

/**
 * Server-component page guard. UI-level gating is a UX convenience — the API
 * and repository layers enforce the same rules authoritatively — but pages a
 * role can never use should not render at all.
 */
export async function requirePagePermission(permission: Permission): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!hasPermission(ctx.role, permission)) {
    redirect(defaultRouteFor());
  }
  return ctx;
}

/**
 * Guard for the Warehouses section. Visibility is not a plain permission
 * (managers see it only when they run more than one warehouse), so it has its
 * own guard that mirrors `canViewWarehousesSection` used by the nav.
 */
export async function requireWarehousesSection(): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!canViewWarehousesSection(ctx)) {
    redirect(defaultRouteFor());
  }
  return ctx;
}

/**
 * Where a user lands after sign-in / when redirected off a forbidden page.
 * Every role has analytics access, so the dashboard is the universal home.
 */
export function defaultRouteFor(): string {
  return '/dashboard';
}
