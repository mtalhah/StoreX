import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorize, type Permission } from '@/core/application/auth/permissions';
import type { TenantContext } from '@/core/application/auth/tenant-context';
import { createServices, type Services } from '@/core/infrastructure/container';
import { tryGetTenantContext } from '@/lib/auth/session';
import { failure, toErrorResponse } from './response';

export interface ApiHandlerArgs<P> {
  req: NextRequest;
  ctx: TenantContext;
  services: Services;
  params: P;
}

type ApiHandler<P> = (args: ApiHandlerArgs<P>) => Promise<NextResponse>;

/**
 * Standard route-handler wrapper: authentication → API-layer permission check
 * → request-scoped service container → error mapping.
 *
 * The declared permission is enforced HERE, before any handler code runs, and
 * enforced AGAIN inside the service layer (and structurally in the
 * repositories). Route handlers stay thin: parse, delegate, respond.
 */
export function withApi<P = Record<string, never>>(
  permission: Permission,
  handler: ApiHandler<P>,
): (req: NextRequest, routeCtx: { params: Promise<P> }) => Promise<NextResponse> {
  return async (req, routeCtx) => {
    try {
      const ctx = await tryGetTenantContext();
      if (!ctx) {
        return failure('UNAUTHORIZED', 'Authentication required.', 401);
      }
      authorize(ctx, permission);
      const services = createServices(ctx);
      return await handler({ req, ctx, services, params: await routeCtx.params });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
