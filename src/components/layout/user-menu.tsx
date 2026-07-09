'use client';

import { LogOut } from 'lucide-react';
import { useTransition } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { signOutAction } from '@/lib/auth/actions';

export function UserMenu({ email, roleLabel }: { email: string; roleLabel: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
      <Avatar className="size-8">
        <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
          {email.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{email}</p>
        <p className="truncate text-[11px] text-muted-foreground">{roleLabel}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
        title="Sign out"
        disabled={isPending}
        onClick={() => startTransition(() => signOutAction())}
      >
        <LogOut className="size-4" />
      </Button>
    </div>
  );
}
