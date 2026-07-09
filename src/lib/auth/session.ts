import 'server-only';
import { cache } from 'react';
import { withAuth } from '@workos-inc/authkit-nextjs';
import type { TenantContext } from '@/core/application/auth/tenant-context';
import { UserSyncService } from '@/core/application/services/user-sync-service';
import { createUserSyncService } from '@/core/infrastructure/container';

/**
 * Resolves the request's TenantContext from the verified WorkOS session:
 * session → internal user (sync/provision on first login) → context.
 *
 * `cache()` memoizes per request, so layouts, pages, and route handlers can
 * all call this without duplicate DB work.
 */
export const getTenantContext = cache(async (): Promise<TenantContext> => {
  // Redirects to hosted sign-in when unauthenticated (server components).
  const { user } = await withAuth({ ensureSignedIn: true });
  return resolveContext(user);
});

/**
 * API variant: returns null instead of redirecting, so route handlers can
 * answer 401 like a REST API should.
 */
export const tryGetTenantContext = cache(async (): Promise<TenantContext | null> => {
  const { user } = await withAuth();
  if (!user) return null;
  return resolveContext(user);
});

async function resolveContext(user: {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}): Promise<TenantContext> {
  const sync = createUserSyncService();
  const internalUser = await sync.resolve({
    workosUserId: user.id,
    email: user.email,
    firstName: user.firstName ?? undefined,
    lastName: user.lastName ?? undefined,
  });
  return UserSyncService.toTenantContext(internalUser);
}
