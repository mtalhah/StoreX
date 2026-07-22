import { Permission } from '@/core/application/auth/permissions';
import { withApi } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { userPermissionOverridesUpdateSchema } from '@/lib/api/schemas';

type Params = { id: string };

/** A user's role baseline, override exceptions, and resolved effective permissions. */
export const GET = withApi<Params>(Permission.UsersManage, async ({ services, params }) => {
  return ok(await services.permissions.getUserPermissions(params.id));
});

/** Replaces this user's grant/revoke exceptions. Rejected for ADMIN targets — see PermissionsService. */
export const PATCH = withApi<Params>(Permission.UsersManage, async ({ req, services, params }) => {
  const body = userPermissionOverridesUpdateSchema.parse(await req.json());
  return ok(await services.permissions.updateUserOverrides(params.id, body.overrides));
});
