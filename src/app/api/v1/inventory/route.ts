import { Permission } from '@/core/application/auth/permissions';
import { withApi } from '@/lib/api/handler';
import { created, okPaginated } from '@/lib/api/response';
import { inventoryCreateSchema, inventoryListSchema, parseQuery } from '@/lib/api/schemas';

export const GET = withApi(Permission.InventoryRead, async ({ req, services }) => {
  const query = parseQuery(inventoryListSchema, req.nextUrl);
  return okPaginated(await services.inventory.list(query));
});

export const POST = withApi(Permission.InventoryManage, async ({ req, services }) => {
  const body = inventoryCreateSchema.parse(await req.json());
  return created(await services.inventory.create(body));
});
