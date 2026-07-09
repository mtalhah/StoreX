import { Permission } from '@/core/application/auth/permissions';
import { withApi } from '@/lib/api/handler';
import { noContent, ok } from '@/lib/api/response';
import { userUpdateSchema } from '@/lib/api/schemas';

type Params = { id: string };

export const GET = withApi<Params>(Permission.UsersRead, async ({ services, params }) => {
  return ok(await services.users.get(params.id));
});

export const PATCH = withApi<Params>(Permission.UsersManage, async ({ req, services, params }) => {
  const body = userUpdateSchema.parse(await req.json());
  return ok(await services.users.update(params.id, body));
});

export const DELETE = withApi<Params>(Permission.UsersManage, async ({ services, params }) => {
  await services.users.remove(params.id);
  return noContent();
});
