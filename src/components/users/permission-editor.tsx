'use client';

import { Permission } from '@/core/application/auth/permissions';
import { PERMISSION_LABELS } from '@/lib/format';
import { cn } from '@/lib/utils';

const ALL_PERMISSIONS = Object.values(Permission);

export type OverrideEffect = 'GRANT' | 'REVOKE';

interface RoleModeProps {
  mode: 'role';
  granted: Set<Permission>;
  onToggle: (permission: Permission) => void;
}

interface UserModeProps {
  mode: 'user';
  /** This user's role baseline — used only to label what "Default" means per row. */
  rolePermissions: Permission[];
  overrides: Map<Permission, OverrideEffect>;
  onSetOverride: (permission: Permission, effect: OverrideEffect | null) => void;
}

/**
 * Checklist of every `Permission`. In role mode each row is a plain on/off
 * toggle for that role's org-wide permission set. In user mode each row is a
 * 3-way control (Default / Grant / Revoke) layered on top of the target
 * user's role baseline — "Default" means "inherit whatever the role says",
 * shown via the row's baseline hint rather than a fixed checked state.
 */
export function PermissionEditor(props: (RoleModeProps | UserModeProps) & { disabled?: boolean }) {
  return (
    <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg border p-2">
      {ALL_PERMISSIONS.map((permission) => {
        const { label, description } = PERMISSION_LABELS[permission];
        return (
          <div
            key={permission}
            className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{label}</p>
              <p className="truncate text-xs text-muted-foreground">{description}</p>
            </div>
            {props.mode === 'role' ? (
              <RoleToggle
                checked={props.granted.has(permission)}
                disabled={props.disabled}
                onClick={() => props.onToggle(permission)}
              />
            ) : (
              <OverrideControl
                fromRole={props.rolePermissions.includes(permission)}
                effect={props.overrides.get(permission) ?? null}
                disabled={props.disabled}
                onChange={(effect) => props.onSetOverride(permission, effect)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function RoleToggle({
  checked,
  disabled,
  onClick,
}: {
  checked: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={checked}
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded border text-[11px] transition-colors disabled:opacity-50',
        checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input hover:border-ring',
      )}
    >
      {checked && '✓'}
    </button>
  );
}

const OVERRIDE_OPTIONS: { value: OverrideEffect | null; label: string }[] = [
  { value: null, label: 'Default' },
  { value: 'GRANT', label: 'Grant' },
  { value: 'REVOKE', label: 'Revoke' },
];

function OverrideControl({
  fromRole,
  effect,
  disabled,
  onChange,
}: {
  fromRole: boolean;
  effect: OverrideEffect | null;
  disabled?: boolean;
  onChange: (effect: OverrideEffect | null) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      {effect === null && (
        <span className="text-[11px] text-muted-foreground">{fromRole ? 'from role' : 'off'}</span>
      )}
      <div className="flex overflow-hidden rounded-md border">
        {OVERRIDE_OPTIONS.map((opt) => {
          const active = effect === opt.value;
          return (
            <button
              key={opt.label}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={cn(
                'px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50',
                active ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
