import { ForbiddenError, ValidationError } from '@/core/domain/errors';
import type { TenantContext } from '../auth/tenant-context';
import type { AuthDirectory } from '../ports/auth-directory';
import type { IdentityRepository, UserWithAccess } from '../ports/identity-repository';

export interface VerifiedWorkosUser {
  workosUserId: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

export interface OnboardInput {
  organizationName: string;
  /**
   * WorkOS organization id from the session, when the user authenticated as a
   * member of an existing WorkOS Organization. When present the tenant links
   * to it; otherwise `onboard` creates a new WorkOS Organization (best-effort).
   */
  sessionWorkosOrgId?: string;
}

const MAX_ORG_NAME_LENGTH = 120;

/**
 * Bridges the verified WorkOS identity to the internal user model.
 *
 * `resolveExisting` handles returning users:
 *   1. Already linked (workosUserId match) — the normal case.
 *   2. Provisioned by an admin but never signed in — linked by email.
 *   3. Unknown — returns null. Unknown users are NOT auto-provisioned; they
 *      go through explicit onboarding (`onboard`) where an admin names their
 *      organization. This is what turns a first sign-in into a deliberate
 *      tenant-creation step rather than a silent one.
 */
export class UserSyncService {
  constructor(
    private readonly identity: IdentityRepository,
    private readonly directory: AuthDirectory,
  ) {}

  async resolveExisting(workosUser: VerifiedWorkosUser): Promise<UserWithAccess | null> {
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

    return null;
  }

  /**
   * Completes onboarding for a signed-in user who has no tenant yet: creates
   * (or links) a WorkOS Organization, then creates the Storex tenant with
   * this user as its Admin. Idempotent — if the user was provisioned in the
   * meantime (e.g. an admin invited them, or a double-submit), the existing
   * record is returned instead of creating a second tenant.
   */
  async onboard(workosUser: VerifiedWorkosUser, input: OnboardInput): Promise<UserWithAccess> {
    const existing = await this.resolveExisting(workosUser);
    if (existing) return existing;

    const organizationName = input.organizationName.trim();
    if (organizationName.length === 0) {
      throw new ValidationError('Organization name is required.');
    }
    if (organizationName.length > MAX_ORG_NAME_LENGTH) {
      throw new ValidationError(`Organization name must be at most ${MAX_ORG_NAME_LENGTH} characters.`);
    }

    // Prefer linking to the WorkOS Organization already on the session;
    // otherwise create one (best-effort — null if the directory is down).
    const workosOrgId =
      input.sessionWorkosOrgId ?? (await this.directory.createOrganization(organizationName));

    return this.identity.createOrganizationWithAdmin({
      organizationName,
      workosOrgId,
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
