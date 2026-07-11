'use client';

import { AlertCircle } from 'lucide-react';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { completeOnboardingAction } from './actions';

export function OnboardingForm({ suggestedName }: { suggestedName: string }) {
  const [state, formAction, isPending] = useActionState(completeOnboardingAction, {});

  return (
    <form action={formAction} className="space-y-4 text-left">
      <div className="space-y-2">
        <Label htmlFor="organizationName">Organization name</Label>
        <Input
          id="organizationName"
          name="organizationName"
          defaultValue={suggestedName}
          placeholder="Acme Logistics"
          required
          maxLength={120}
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          This creates your tenant. You can invite managers and operators once you&apos;re in.
        </p>
      </div>

      {state.error && (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending ? 'Setting up…' : 'Create organization'}
      </Button>
    </form>
  );
}
