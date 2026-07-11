'use server';

import { redirect } from 'next/navigation';
import { DomainError } from '@/core/domain/errors';
import { createUserSyncService } from '@/core/infrastructure/container';
import { getOnboardingState } from '@/lib/auth/session';

/**
 * Completes onboarding: names the tenant, links/creates a WorkOS Organization,
 * and makes the current user its Admin. Re-checks onboarding state server-side
 * (never trusts the client) and is idempotent via UserSyncService.onboard.
 */
export async function completeOnboardingAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const organizationName = String(formData.get('organizationName') ?? '');

  const state = await getOnboardingState();
  // Already onboarded (e.g. invited in the meantime, or a double submit):
  // skip straight to the app. redirect() throws, so it's outside try/catch.
  if (state.status === 'onboarded') redirect('/dashboard');

  try {
    const sync = createUserSyncService();
    await sync.onboard(state.workosUser, {
      organizationName,
      sessionWorkosOrgId: state.sessionWorkosOrgId,
    });
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }

  redirect('/dashboard');
}
