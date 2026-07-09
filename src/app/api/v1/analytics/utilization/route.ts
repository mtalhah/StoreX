import { Permission } from '@/core/application/auth/permissions';
import { withApi } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';

export const GET = withApi(Permission.AnalyticsRead, async ({ services }) => {
  return ok(await services.analytics.warehouseUtilization());
});
