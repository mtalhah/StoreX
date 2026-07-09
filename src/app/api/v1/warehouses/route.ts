import { Permission } from '@/core/application/auth/permissions';
import { withApi } from '@/lib/api/handler';
import { created, okPaginated } from '@/lib/api/response';
import { parseQuery, warehouseCreateSchema, warehouseListSchema } from '@/lib/api/schemas';

export const GET = withApi(Permission.WarehousesRead, async ({ req, services }) => {
  const query = parseQuery(warehouseListSchema, req.nextUrl);
  return okPaginated(await services.warehouses.list(query));
});

export const POST = withApi(Permission.WarehousesManage, async ({ req, services }) => {
  const body = warehouseCreateSchema.parse(await req.json());
  return created(await services.warehouses.create(body));
});
