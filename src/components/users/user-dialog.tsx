'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { UserRole } from '@/core/domain/enums';
import { apiFetch, ApiError } from '@/lib/client/api';
import type { UserRow } from '@/lib/client/types';
import { ROLE_LABELS } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Invite/edit dialog. Assignment rules come from the server (operators:
 * exactly one warehouse; managers: at least one; admins: none) — the dialog
 * shapes its inputs accordingly but the service layer is authoritative.
 */
export function UserDialog({
  open,
  user,
  warehouses,
  isSelf,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  user: UserRow | null;
  warehouses: Array<{ id: string; name: string }>;
  isSelf?: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Remounted per open/target so the form always starts from props. */}
        {open && (
          <UserForm
            key={user?.id ?? 'new'}
            user={user}
            warehouses={warehouses}
            isSelf={isSelf}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function UserForm({
  user,
  warehouses,
  isSelf,
  onOpenChange,
  onSaved,
}: {
  user: UserRow | null;
  warehouses: Array<{ id: string; name: string }>;
  isSelf?: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isEdit = user !== null;
  const [email, setEmail] = useState(user?.email ?? '');
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [role, setRole] = useState<UserRole>(user?.role ?? 'OPERATOR');
  const [selectedWarehouses, setSelectedWarehouses] = useState<string[]>(
    user?.warehouses.map((w) => w.id) ?? [],
  );
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [busy, setBusy] = useState(false);

  const toggleWarehouse = (id: string) => {
    setSelectedWarehouses((prev) => {
      if (role === 'OPERATOR') return [id]; // exactly one
      return prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id];
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const warehouseIds = role === 'ADMIN' ? [] : selectedWarehouses;
      if (isEdit) {
        await apiFetch(`/api/v1/users/${user.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            firstName: firstName || undefined,
            lastName: lastName || undefined,
            ...(isSelf ? {} : { role }),
            warehouseIds,
            isActive,
          }),
        });
        toast.success('User updated.');
      } else {
        await apiFetch('/api/v1/users', {
          method: 'POST',
          body: JSON.stringify({
            email,
            firstName: firstName || undefined,
            lastName: lastName || undefined,
            role,
            warehouseIds,
          }),
        });
        toast.success(`${email} invited. They can sign in with this email right away.`);
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const needsWarehouses = role !== 'ADMIN';

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'Edit user' : 'Invite user'}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? 'Change role, warehouse access, or account status.'
            : 'The user signs in through WorkOS with this email and is linked automatically.'}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        {!isEdit && (
          <div className="space-y-2">
            <Label htmlFor="u-email">Email</Label>
            <Input
              id="u-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="u-first">First name</Label>
            <Input id="u-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="u-last">Last name</Label>
            <Input id="u-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Role</Label>
          <Select
            value={role}
            onValueChange={(v) => {
              if (!v) return;
              const next = v as UserRole;
              setRole(next);
              if (next === 'OPERATOR') setSelectedWarehouses((prev) => prev.slice(0, 1));
            }}
            disabled={isSelf}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['ADMIN', 'MANAGER', 'OPERATOR'] as const).map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isSelf && (
            <p className="text-xs text-muted-foreground">You cannot change your own role.</p>
          )}
        </div>
        {needsWarehouses && (
          <div className="space-y-2">
            <Label>
              Warehouse access{' '}
              <span className="font-normal text-muted-foreground">
                ({role === 'OPERATOR' ? 'exactly one' : 'one or more'})
              </span>
            </Label>
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border p-2">
              {warehouses.length === 0 && (
                <p className="p-2 text-sm text-muted-foreground">No warehouses created yet.</p>
              )}
              {warehouses.map((w) => {
                const checked = selectedWarehouses.includes(w.id);
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => toggleWarehouse(w.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                      checked ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-4 items-center justify-center rounded border text-[10px]',
                        checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                      )}
                    >
                      {checked && '✓'}
                    </span>
                    {w.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {isEdit && !isSelf && (
          <div className="space-y-2">
            <Label>Account status</Label>
            <Select
              value={isActive ? 'active' : 'inactive'}
              onValueChange={(v) => v && setIsActive(v === 'active')}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Deactivated — sign-in blocked</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={busy || (needsWarehouses && selectedWarehouses.length === 0)}
          >
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Send invite'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
