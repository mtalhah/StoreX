import { Permission } from '@/core/application/auth/permissions';
import { withApi } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { parseQuery, periodQuerySchema } from '@/lib/api/schemas';

export const GET = withApi(Permission.AnalyticsRead, async ({ req, services }) => {
  const { days } = parseQuery(periodQuerySchema, req.nextUrl);
  return ok(await services.analytics.kpis(days));
});
