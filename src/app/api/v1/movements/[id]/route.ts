import { Permission } from '@/core/application/auth/permissions';
import { withApi } from '@/lib/api/handler';
import { noContent, ok } from '@/lib/api/response';
import { movementUpdateSchema } from '@/lib/api/schemas';

type Params = { id: string };

export const PATCH = withApi<Params>(Permission.MovementsManage, async ({ req, services, params }) => {
  const body = movementUpdateSchema.parse(await req.json());
  return ok(await services.movements.update(params.id, body));
});

export const DELETE = withApi<Params>(Permission.MovementsManage, async ({ services, params }) => {
  await services.movements.delete(params.id);
  return noContent();
});
