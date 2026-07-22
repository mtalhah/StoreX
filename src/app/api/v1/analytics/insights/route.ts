import { Permission } from '@/core/application/auth/permissions';
import { withApi } from '@/lib/api/handler';
import { okPaginated } from '@/lib/api/response';
import { insightsQuerySchema, parseQuery } from '@/lib/api/schemas';

export const GET = withApi(Permission.AnalyticsRead, async ({ req, services }) => {
  const { days, warehouseId, status, lastMovementFrom, lastMovementTo, page, pageSize } = parseQuery(
    insightsQuerySchema,
    req.nextUrl,
  );
  return okPaginated(
    await services.analytics.inventoryInsights(
      days,
      { warehouseId, status, lastMovementFrom, lastMovementTo },
      { page, pageSize },
    ),
  );
});
