import type { PrismaClient } from '../db/prisma';
import type { Permission } from '@/core/application/auth/permissions';
import type {
  PermissionOverride,
  PermissionRepository,
} from '@/core/application/ports/permission-repository';
import type { TenantContext } from '@/core/application/auth/tenant-context';
import type { UserRole } from '@/core/domain/enums';

/**
 * Role-permission writes are scoped to `ctx.organizationId`; user-override
 * writes are scoped to users belonging to that organization — the caller
 * (PermissionsService) validates the target user's tenancy before invoking
 * `setUserOverrides`, so this is defense-in-depth, not the only check.
 */
export class PrismaPermissionRepository implements PermissionRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly ctx: TenantContext,
  ) {}

  async getRolePermissions(role: UserRole): Promise<Permission[]> {
    const rows = await this.db.rolePermission.findMany({
      where: { organizationId: this.ctx.organizationId, role },
      select: { permission: true },
    });
    return rows.map((r) => r.permission as Permission);
  }

  async setRolePermissions(role: UserRole, permissions: Permission[]): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({
        where: { organizationId: this.ctx.organizationId, role },
      });
      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({
            organizationId: this.ctx.organizationId,
            role,
            permission,
          })),
        });
      }
    });
  }

  async getUserOverrides(userId: string): Promise<PermissionOverride[]> {
    const rows = await this.db.userPermissionOverride.findMany({
      where: { userId, user: { organizationId: this.ctx.organizationId } },
      select: { permission: true, effect: true },
    });
    return rows.map((r) => ({ permission: r.permission as Permission, effect: r.effect }));
  }

  async setUserOverrides(userId: string, overrides: PermissionOverride[]): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.userPermissionOverride.deleteMany({
        where: { userId, user: { organizationId: this.ctx.organizationId } },
      });
      if (overrides.length > 0) {
        await tx.userPermissionOverride.createMany({
          data: overrides.map((o) => ({ userId, permission: o.permission, effect: o.effect })),
        });
      }
    });
  }
}
