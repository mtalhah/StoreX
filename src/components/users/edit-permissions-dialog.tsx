'use client';

import { Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Permission } from '@/core/application/auth/permissions';
import { apiFetch, ApiError, swrFetcher, type ApiResult } from '@/lib/client/api';
import type { UserRow } from '@/lib/client/types';
import { ROLE_LABELS } from '@/lib/format';
import { PermissionEditor } from './permission-editor';
import { UserPermissionsForm, type UserPermissionsView } from './user-permissions-form';

type EditableRole = 'MANAGER' | 'OPERATOR';
const EDITABLE_ROLES: EditableRole[] = ['MANAGER', 'OPERATOR'];

interface RoleMatrix {
  ADMIN: Permission[];
  MANAGER: Permission[];
  OPERATOR: Permission[];
}

/**
 * Standalone permissions editor, opened from the Users page header.
 * "By role" edits an org-wide MANAGER/OPERATOR permission set; "By person"
 * edits one user's grant/revoke exceptions on top of their role. ADMIN is
 * absent from both — its permissions are fixed (see permissions.ts).
 */
export function EditPermissionsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [mode, setMode] = useState<'role' | 'user'>('role');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit permissions</DialogTitle>
          <DialogDescription>
            Change what a role can do organization-wide, or make an exception for one person.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(v) => v && setMode(v as 'role' | 'user')}>
          <TabsList className="w-full">
            <TabsTrigger value="role" className="flex-1">
              By role
            </TabsTrigger>
            <TabsTrigger value="user" className="flex-1">
              By person
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {open && (mode === 'role' ? <RolePanel /> : <PersonPanel />)}
      </DialogContent>
    </Dialog>
  );
}

function RolePanel() {
  const [role, setRole] = useState<EditableRole>('MANAGER');
  const { data, isLoading, mutate } = useSWR<ApiResult<RoleMatrix>>(
    '/api/v1/permissions/roles',
    swrFetcher<RoleMatrix>,
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Role</Label>
        <Select value={role} onValueChange={(v) => v && setRole(v as EditableRole)}>
          <SelectTrigger className="w-full">
            <SelectValue>{(v: EditableRole) => ROLE_LABELS[v]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {EDITABLE_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isLoading || !data ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        // Remounted per role so local edits always start from that role's fetched set.
        <RoleForm key={role} role={role} initial={data.data[role]} onSaved={() => mutate()} />
      )}
    </div>
  );
}

function RoleForm({
  role,
  initial,
  onSaved,
}: {
  role: EditableRole;
  initial: Permission[];
  onSaved: () => void;
}) {
  const [granted, setGranted] = useState<Set<Permission>>(() => new Set(initial));
  const [busy, setBusy] = useState(false);

  const toggle = (permission: Permission) => {
    setGranted((prev) => {
      const next = new Set(prev);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      await apiFetch(`/api/v1/permissions/roles/${role}`, {
        method: 'PATCH',
        body: JSON.stringify({ permissions: [...granted] }),
      });
      toast.success(`${ROLE_LABELS[role]} permissions updated.`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to update permissions.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PermissionEditor mode="role" granted={granted} onToggle={toggle} disabled={busy} />
      <DialogFooter>
        <Button onClick={save} disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
      </DialogFooter>
    </div>
  );
}

interface UserOption {
  value: string;
  label: string;
}

function PersonPanel() {
  const [userId, setUserId] = useState('');
  const { data: usersData } = useSWR<ApiResult<UserRow[]>>(
    '/api/v1/users?page=1&pageSize=100&sortBy=email&sortDir=asc',
    swrFetcher<UserRow[]>,
  );
  const options = useMemo<UserOption[]>(
    () =>
      (usersData?.data ?? [])
        // ADMIN's permissions are fixed — no per-user overrides apply to it.
        .filter((u) => u.role !== 'ADMIN')
        .map((u) => ({ value: u.id, label: `${u.email} — ${ROLE_LABELS[u.role]}` })),
    [usersData],
  );
  const selected = options.find((o) => o.value === userId) ?? null;

  const { data, isLoading, mutate } = useSWR<ApiResult<UserPermissionsView>>(
    userId ? `/api/v1/users/${userId}/permissions` : null,
    swrFetcher<UserPermissionsView>,
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Person</Label>
        <Combobox
          items={options}
          value={selected}
          onValueChange={(v) => setUserId((v as UserOption | null)?.value ?? '')}
        >
          <ComboboxInputGroup>
            <ComboboxInput placeholder="Search by email…" />
            <ComboboxTrigger />
          </ComboboxInputGroup>
          <ComboboxContent>
            <ComboboxEmpty>No users found.</ComboboxEmpty>
            <ComboboxList>
              {(option: UserOption) => (
                <ComboboxItem key={option.value} value={option}>
                  {option.label}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
      {userId && (isLoading || !data) && (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      )}
      {userId && data && (
        <UserPermissionsForm key={userId} userId={userId} initial={data.data} onSaved={() => mutate()} />
      )}
    </div>
  );
}
