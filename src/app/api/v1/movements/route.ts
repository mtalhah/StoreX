import { Permission } from '@/core/application/auth/permissions';
import { withApi } from '@/lib/api/handler';
import { created, okPaginated } from '@/lib/api/response';
import { movementCreateSchema, movementListSchema, parseQuery } from '@/lib/api/schemas';

export const GET = withApi(Permission.MovementsRead, async ({ req, services }) => {
  const query = parseQuery(movementListSchema, req.nextUrl);
  return okPaginated(await services.movements.list(query));
});

export const POST = withApi(Permission.MovementsCreate, async ({ req, services }) => {
  const body = movementCreateSchema.parse(await req.json());
  return created(await services.movements.record(body));
});
