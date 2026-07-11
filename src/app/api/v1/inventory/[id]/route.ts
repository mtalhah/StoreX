import { Permission } from '@/core/application/auth/permissions';
import { withApi } from '@/lib/api/handler';
import { noContent, ok } from '@/lib/api/response';
import { inventoryUpdateSchema, resolveStorageUnitsPerItem } from '@/lib/api/schemas';

type Params = { id: string };

export const GET = withApi<Params>(Permission.InventoryRead, async ({ services, params }) => {
  return ok(await services.inventory.get(params.id));
});

export const PATCH = withApi<Params>(Permission.InventoryManage, async ({ req, services, params }) => {
  const { storageUnitsPerItem, itemsPerStorageUnit, ...rest } = inventoryUpdateSchema.parse(
    await req.json(),
  );
  const resolvedRatio = resolveStorageUnitsPerItem({ storageUnitsPerItem, itemsPerStorageUnit });
  return ok(
    await services.inventory.update(params.id, {
      ...rest,
      ...(resolvedRatio !== undefined ? { storageUnitsPerItem: resolvedRatio } : {}),
    }),
  );
});

export const DELETE = withApi<Params>(Permission.InventoryManage, async ({ services, params }) => {
  await services.inventory.remove(params.id);
  return noContent();
});
