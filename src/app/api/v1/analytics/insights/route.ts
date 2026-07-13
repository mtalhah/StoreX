import { Permission } from '@/core/application/auth/permissions';
import { withApi } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { insightsQuerySchema, parseQuery } from '@/lib/api/schemas';

export const GET = withApi(Permission.AnalyticsRead, async ({ req, services }) => {
  const { days, warehouseId, status, lastMovementFrom, lastMovementTo } = parseQuery(
    insightsQuerySchema,
    req.nextUrl,
  );
  return ok(
    await services.analytics.inventoryInsights(days, {
      warehouseId,
      status,
      lastMovementFrom,
      lastMovementTo,
    }),
  );
});
