import { NextResponse } from 'next/server';
import { hasPermission, Permission } from '@/core/application/auth/permissions';
import { failure, ok, toErrorResponse } from '@/lib/api/response';
import { tryGetTenantContext } from '@/lib/auth/session';

/**
 * Current session profile. Not wrapped in withApi because it has no
 * resource permission — any authenticated user may ask who they are.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const ctx = await tryGetTenantContext();
    if (!ctx) return failure('UNAUTHORIZED', 'Authentication required.', 401);

    return ok({
      userId: ctx.userId,
      email: ctx.email,
      role: ctx.role,
      organizationId: ctx.organizationId,
      accessibleWarehouseIds: ctx.accessibleWarehouseIds,
      permissions: Object.values(Permission).filter((p) => hasPermission(ctx.role, p)),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
