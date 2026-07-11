import { Boxes } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { withAuth } from '@workos-inc/authkit-nextjs';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Welcome' };

/** Public landing page; signed-in users go straight to the app. */
export default async function LandingPage() {
  const { user } = await withAuth();
  if (user) redirect('/dashboard');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-muted px-6">
      <div className="flex w-full max-w-md flex-col items-center gap-8 rounded-2xl border bg-card p-10 text-center shadow-sm">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <Boxes className="size-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Storex</h1>
          <p className="text-sm text-muted-foreground">
            Enterprise warehouse management — multi-tenant inventory, stock movements, and
            real-time analytics on Google Cloud.
          </p>
        </div>
        {/* /sign-in is a route handler that sets the PKCE cookie and
            forwards to WorkOS hosted auth. */}
        <Button size="lg" className="w-full" nativeButton={false} render={<a href="/sign-in" />}>
          Sign in to continue
        </Button>
        <p className="text-xs text-muted-foreground">
          Secured by WorkOS AuthKit. New here? After signing in you&apos;ll name your organization
          to get started.
        </p>
      </div>
    </main>
  );
}
