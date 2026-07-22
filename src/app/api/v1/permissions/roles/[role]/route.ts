import { Permission } from '@/core/application/auth/permissions';
import { withApi } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';
import { roleParamSchema, rolePermissionsUpdateSchema } from '@/lib/api/schemas';

type Params = { role: string };

/** Replaces MANAGER's or OPERATOR's org-wide permission set. ADMIN is rejected — see PermissionsService. */
export const PATCH = withApi<Params>(Permission.UsersManage, async ({ req, services, params }) => {
  const { role } = roleParamSchema.parse(params);
  const body = rolePermissionsUpdateSchema.parse(await req.json());
  return ok(await services.permissions.updateRolePermissions(role, body.permissions));
});
