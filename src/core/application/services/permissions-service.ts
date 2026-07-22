import { ForbiddenError, NotFoundError, ValidationError } from '@/core/domain/errors';
import type { UserRole } from '@/core/domain/enums';
import {
  Permission,
  authorize,
  defaultPermissionsForRole,
  resolveEffectivePermissions,
} from '../auth/permissions';
import type { TenantContext } from '../auth/tenant-context';
import type { PermissionOverride, PermissionRepository } from '../ports/permission-repository';
import type { UserRepository } from '../ports/user-repository';

const EDITABLE_ROLES: readonly UserRole[] = ['MANAGER', 'OPERATOR'];
const ALL_PERMISSIONS = new Set<string>(Object.values(Permission));

export interface RoleMatrix {
  ADMIN: Permission[];
  MANAGER: Permission[];
  OPERATOR: Permission[];
}

export interface UserPermissionsView {
  role: UserRole;
  rolePermissions: Permission[];
  overrides: PermissionOverride[];
  effective: Permission[];
}

/**
 * Manages the editable parts of RBAC: an organization's MANAGER/OPERATOR
 * permission sets, and per-user grant/revoke exceptions on top of them.
 *
 * Every method here hard-checks `ctx.role === 'ADMIN'` in addition to the
 * route-level `Permission.UsersManage` gate (see withApi). This is
 * deliberate, not redundant: because MANAGER/OPERATOR permissions are now
 * editable, an admin could grant `UsersManage` to a non-admin — gating on
 * that same delegatable permission would let such a user edit permissions
 * (including their own), an escalation path. Only the fixed ADMIN role may
 * touch this feature.
 */
export class PermissionsService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly permissions: PermissionRepository,
    private readonly users: UserRepository,
  ) {}

  async getRoleMatrix(): Promise<RoleMatrix> {
    authorize(this.ctx, Permission.UsersManage);
    this.requireAdmin();

    const [manager, operator] = await Promise.all([
      this.permissions.getRolePermissions('MANAGER'),
      this.permissions.getRolePermissions('OPERATOR'),
    ]);
    return {
      ADMIN: [...defaultPermissionsForRole('ADMIN')],
      MANAGER: manager,
      OPERATOR: operator,
    };
  }

  async updateRolePermissions(role: UserRole, permissions: Permission[]): Promise<Permission[]> {
    authorize(this.ctx, Permission.UsersManage);
    this.requireAdmin();

    if (!EDITABLE_ROLES.includes(role)) {
      throw new ValidationError('Only MANAGER and OPERATOR permissions can be edited.');
    }
    this.validatePermissionList(permissions);

    const deduped = [...new Set(permissions)];
    await this.permissions.setRolePermissions(role, deduped);
    return deduped;
  }

  async getUserPermissions(userId: string): Promise<UserPermissionsView> {
    authorize(this.ctx, Permission.UsersManage);
    this.requireAdmin();

    const target = await this.users.findById(userId);
    if (!target) throw new NotFoundError('User', userId);

    if (target.role === 'ADMIN') {
      const admin = [...defaultPermissionsForRole('ADMIN')];
      return { role: 'ADMIN', rolePermissions: admin, overrides: [], effective: admin };
    }

    const [rolePermissions, overrides] = await Promise.all([
      this.permissions.getRolePermissions(target.role),
      this.permissions.getUserOverrides(userId),
    ]);
    const effective = resolveEffectivePermissions(target.role, rolePermissions, overrides);
    return { role: target.role, rolePermissions, overrides, effective };
  }

  async updateUserOverrides(
    userId: string,
    overrides: PermissionOverride[],
  ): Promise<UserPermissionsView> {
    authorize(this.ctx, Permission.UsersManage);
    this.requireAdmin();

    const target = await this.users.findById(userId);
    if (!target) throw new NotFoundError('User', userId);
    if (target.role === 'ADMIN') {
      throw new ValidationError('ADMIN permissions are fixed and cannot be overridden.');
    }

    const seen = new Set<Permission>();
    for (const o of overrides) {
      if (!ALL_PERMISSIONS.has(o.permission)) {
        throw new ValidationError(`Unknown permission: ${o.permission}`);
      }
      if (seen.has(o.permission)) {
        throw new ValidationError(`Duplicate override for permission: ${o.permission}`);
      }
      seen.add(o.permission);
    }

    await this.permissions.setUserOverrides(userId, overrides);
    return this.getUserPermissions(userId);
  }

  private requireAdmin(): void {
    if (this.ctx.role !== 'ADMIN') {
      throw new ForbiddenError('Only an administrator can view or edit permissions.');
    }
  }

  private validatePermissionList(permissions: Permission[]): void {
    for (const p of permissions) {
      if (!ALL_PERMISSIONS.has(p)) {
        throw new ValidationError(`Unknown permission: ${p}`);
      }
    }
  }
}
