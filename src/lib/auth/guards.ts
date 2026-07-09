import 'server-only';
import { redirect } from 'next/navigation';
import { hasPermission, type Permission } from '@/core/application/auth/permissions';
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
    redirect(defaultRouteFor(ctx));
  }
  return ctx;
}

/** Where each role lands after sign-in. */
export function defaultRouteFor(ctx: TenantContext): string {
  return hasPermission(ctx.role, 'analytics:read') ? '/dashboard' : '/inventory';
}
