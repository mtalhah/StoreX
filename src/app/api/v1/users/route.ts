import { Permission } from '@/core/application/auth/permissions';
import { withApi } from '@/lib/api/handler';
import { created, okPaginated } from '@/lib/api/response';
import { parseQuery, userCreateSchema, userListSchema } from '@/lib/api/schemas';

export const GET = withApi(Permission.UsersRead, async ({ req, services }) => {
  const query = parseQuery(userListSchema, req.nextUrl);
  return okPaginated(await services.users.list(query));
});

export const POST = withApi(Permission.UsersManage, async ({ req, services }) => {
  const body = userCreateSchema.parse(await req.json());
  return created(await services.users.create(body));
});
