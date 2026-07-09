import { ForbiddenError } from '@/core/domain/errors';
import type { TenantContext } from '../auth/tenant-context';
import type { IdentityRepository, UserWithAccess } from '../ports/identity-repository';

export interface VerifiedWorkosUser {
  workosUserId: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Bridges the verified WorkOS identity to the internal user model. Resolution
 * order:
 *   1. Already linked (workosUserId match) — the normal case.
 *   2. Provisioned by an admin but never signed in — link by email.
 *   3. Unknown — self-serve signup: a fresh organization is created with this
 *      user as its Admin. New tenants start empty; they never see other data.
 */
export class UserSyncService {
  constructor(private readonly identity: IdentityRepository) {}

  async resolve(workosUser: VerifiedWorkosUser): Promise<UserWithAccess> {
    const linked = await this.identity.findByWorkosUserId(workosUser.workosUserId);
    if (linked) {
      if (!linked.isActive) throw new ForbiddenError('This account has been deactivated.');
      return linked;
    }

    const provisioned = await this.identity.findUnlinkedByEmail(workosUser.email);
    if (provisioned) {
      if (!provisioned.isActive) throw new ForbiddenError('This account has been deactivated.');
      return this.identity.linkWorkosUser(provisioned.id, workosUser.workosUserId, {
        firstName: workosUser.firstName,
        lastName: workosUser.lastName,
      });
    }

    const orgName = workosUser.firstName
      ? `${workosUser.firstName}'s Organization`
      : `${workosUser.email.split('@')[0]}'s Organization`;
    return this.identity.createOrganizationWithAdmin({
      organizationName: orgName,
      workosUserId: workosUser.workosUserId,
      email: workosUser.email,
      firstName: workosUser.firstName,
      lastName: workosUser.lastName,
    });
  }

  static toTenantContext(user: UserWithAccess): TenantContext {
    return {
      organizationId: user.organizationId,
      userId: user.id,
      email: user.email,
      role: user.role,
      // Admins see the whole organization; everyone else only their
      // assigned warehouses.
      accessibleWarehouseIds: user.role === 'ADMIN' ? null : user.assignedWarehouseIds,
    };
  }
}
