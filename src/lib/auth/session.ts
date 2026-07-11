import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { withAuth } from '@workos-inc/authkit-nextjs';
import type { TenantContext } from '@/core/application/auth/tenant-context';
import {
  UserSyncService,
  type VerifiedWorkosUser,
} from '@/core/application/services/user-sync-service';
import { createUserSyncService } from '@/core/infrastructure/container';

type WorkosUser = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
};

function toVerified(user: WorkosUser): VerifiedWorkosUser {
  return {
    workosUserId: user.id,
    email: user.email,
    firstName: user.firstName ?? undefined,
    lastName: user.lastName ?? undefined,
  };
}

/** Resolves an already-provisioned user to a context, or null if not onboarded. */
async function resolveExistingContext(user: WorkosUser): Promise<TenantContext | null> {
  const sync = createUserSyncService();
  const internalUser = await sync.resolveExisting(toVerified(user));
  return internalUser ? UserSyncService.toTenantContext(internalUser) : null;
}

/**
 * Resolves the request's TenantContext from the verified WorkOS session.
 * A signed-in user with no tenant yet is sent to `/onboarding` (they have
 * authenticated but not chosen an organization name). `cache()` memoizes per
 * request so layouts, pages, and route handlers share one resolution.
 */
export const getTenantContext = cache(async (): Promise<TenantContext> => {
  // Redirects to hosted sign-in when unauthenticated (server components).
  const { user } = await withAuth({ ensureSignedIn: true });
  const ctx = await resolveExistingContext(user);
  if (!ctx) redirect('/onboarding');
  return ctx;
});

/**
 * API variant: returns null instead of redirecting, so route handlers can
 * answer 401 like a REST API should. A not-yet-onboarded user is treated as
 * unauthenticated for API purposes (they have no tenant to act within).
 */
export const tryGetTenantContext = cache(async (): Promise<TenantContext | null> => {
  const { user } = await withAuth();
  if (!user) return null;
  return resolveExistingContext(user);
});

export type OnboardingState =
  | { status: 'onboarded'; ctx: TenantContext }
  | { status: 'needs_onboarding'; workosUser: VerifiedWorkosUser; sessionWorkosOrgId?: string };

/**
 * State for the onboarding page: the verified WorkOS identity plus whether a
 * tenant already exists for it. Redirects to hosted sign-in if unauthenticated.
 */
export async function getOnboardingState(): Promise<OnboardingState> {
  const { user, organizationId } = await withAuth({ ensureSignedIn: true });
  const ctx = await resolveExistingContext(user);
  if (ctx) return { status: 'onboarded', ctx };
  return {
    status: 'needs_onboarding',
    workosUser: toVerified(user),
    sessionWorkosOrgId: organizationId,
  };
}
