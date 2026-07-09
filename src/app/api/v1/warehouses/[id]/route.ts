import { Permission } from '@/core/application/auth/permissions';
import { withApi } from '@/lib/api/handler';
import { noContent, ok } from '@/lib/api/response';
import { warehouseUpdateSchema } from '@/lib/api/schemas';

type Params = { id: string };

export const GET = withApi<Params>(Permission.WarehousesRead, async ({ services, params }) => {
  return ok(await services.warehouses.get(params.id));
});

export const PATCH = withApi<Params>(Permission.WarehousesManage, async ({ req, services, params }) => {
  const body = warehouseUpdateSchema.parse(await req.json());
  return ok(await services.warehouses.update(params.id, body));
});

export const DELETE = withApi<Params>(Permission.WarehousesManage, async ({ services, params }) => {
  await services.warehouses.remove(params.id);
  return noContent();
});
