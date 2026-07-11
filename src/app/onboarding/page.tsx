import { Building2 } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOnboardingState } from '@/lib/auth/session';
import { OnboardingForm } from './onboarding-form';

export const metadata: Metadata = { title: 'Set up your organization' };

/**
 * Onboarding lives OUTSIDE the (app) route group on purpose: the app layout
 * resolves the tenant context and redirects here when the user has none, so
 * placing this page under that layout would create a redirect loop.
 *
 * A user reaches this page only after authenticating with WorkOS but before a
 * tenant exists for them. Invited users never see it — they resolve to their
 * inviter's tenant on first sign-in and go straight to the app.
 */
export default async function OnboardingPage() {
  const state = await getOnboardingState();
  if (state.status === 'onboarded') redirect('/dashboard');

  const { email, firstName } = state.workosUser;
  const suggestedName = firstName ? `${firstName}'s Organization` : `${email.split('@')[0]}'s Organization`;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-muted px-6">
      <div className="flex w-full max-w-md flex-col items-center gap-7 rounded-2xl border bg-card p-10 text-center shadow-sm">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <Building2 className="size-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Set up your organization</h1>
          <p className="text-sm text-muted-foreground">
            Welcome, {firstName || email}. Name your company to create your Storex tenant — you&apos;ll
            be its admin.
          </p>
        </div>
        <div className="w-full">
          <OnboardingForm suggestedName={suggestedName} />
        </div>
      </div>
    </main>
  );
}
