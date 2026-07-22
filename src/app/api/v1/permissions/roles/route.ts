import { Permission } from '@/core/application/auth/permissions';
import { withApi } from '@/lib/api/handler';
import { ok } from '@/lib/api/response';

/** Org's role → permission matrix (ADMIN fixed, MANAGER/OPERATOR editable). */
export const GET = withApi(Permission.UsersManage, async ({ services }) => {
  return ok(await services.permissions.getRoleMatrix());
});
