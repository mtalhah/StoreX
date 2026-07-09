import { Permission } from '@/core/application/auth/permissions';
import { withApi } from '@/lib/api/handler';
import { noContent, ok } from '@/lib/api/response';
import { inventoryUpdateSchema } from '@/lib/api/schemas';

type Params = { id: string };

export const GET = withApi<Params>(Permission.InventoryRead, async ({ services, params }) => {
  return ok(await services.inventory.get(params.id));
});

export const PATCH = withApi<Params>(Permission.InventoryManage, async ({ req, services, params }) => {
  const body = inventoryUpdateSchema.parse(await req.json());
  return ok(await services.inventory.update(params.id, body));
});

export const DELETE = withApi<Params>(Permission.InventoryManage, async ({ services, params }) => {
  await services.inventory.remove(params.id);
  return noContent();
});
