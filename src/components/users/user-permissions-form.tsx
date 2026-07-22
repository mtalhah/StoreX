'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { Permission } from '@/core/application/auth/permissions';
import type { UserRole } from '@/core/domain/enums';
import { apiFetch, ApiError } from '@/lib/client/api';
import { PermissionEditor, type OverrideEffect } from './permission-editor';

export interface UserPermissionsView {
  role: UserRole;
  rolePermissions: Permission[];
  overrides: { permission: Permission; effect: OverrideEffect }[];
  effective: Permission[];
}

/**
 * Grant/revoke override editor for one user, on top of their role's
 * baseline. Shared by the standalone "Edit permissions" modal's By-person
 * tab and the inline Permissions section in UserDialog — same fetch/save
 * behavior, kept in one place instead of two copies drifting apart.
 */
export function UserPermissionsForm({
  userId,
  initial,
  onSaved,
}: {
  userId: string;
  initial: UserPermissionsView;
  onSaved: () => void;
}) {
  const [overrides, setOverrides] = useState<Map<Permission, OverrideEffect>>(
    () => new Map(initial.overrides.map((o) => [o.permission, o.effect])),
  );
  const [busy, setBusy] = useState(false);

  const setOverride = (permission: Permission, effect: OverrideEffect | null) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      if (effect === null) next.delete(permission);
      else next.set(permission, effect);
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      await apiFetch(`/api/v1/users/${userId}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify({
          overrides: [...overrides.entries()].map(([permission, effect]) => ({
            permission,
            effect,
          })),
        }),
      });
      toast.success('Permissions updated.');
      onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to update permissions.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <PermissionEditor
        mode="user"
        rolePermissions={initial.rolePermissions}
        overrides={overrides}
        onSetOverride={setOverride}
        disabled={busy}
      />
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={save} disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {busy ? 'Saving…' : 'Save permissions'}
        </Button>
      </div>
    </div>
  );
}
