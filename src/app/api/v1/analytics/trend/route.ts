import { Permission } from '@/core/application/auth/permissions';
import { withApi } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { parseQuery, trendQuerySchema } from '@/lib/api/schemas';

export const GET = withApi(Permission.AnalyticsRead, async ({ req, services }) => {
  const { days } = parseQuery(trendQuerySchema, req.nextUrl);
  return ok(await services.analytics.movementTrend(days));
});
