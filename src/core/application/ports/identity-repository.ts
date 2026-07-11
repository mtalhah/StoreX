import type { User } from '@/core/domain/entities';

/**
 * The one deliberately tenant-UNSCOPED port. It exists only for the sign-in
 * bootstrap — resolving a verified WorkOS identity to an internal user before
 * a TenantContext can exist. It is consumed exclusively by UserSyncService
 * and must never be reachable from request-scoped business services.
 */
export interface UserWithAccess extends User {
  /** Warehouse ids from assignments; used to build the TenantContext. */
  assignedWarehouseIds: string[];
}

export interface IdentityRepository {
  findByWorkosUserId(workosUserId: string): Promise<UserWithAccess | null>;
  /** Provisioned-but-never-signed-in users: matched by email, not yet linked. */
  findUnlinkedByEmail(email: string): Promise<UserWithAccess | null>;
  linkWorkosUser(userId: string, workosUserId: string, profile: { firstName?: string; lastName?: string }): Promise<UserWithAccess>;
  /**
   * Onboarding: create a fresh tenant (Organization) with this WorkOS user as
   * its Admin. `workosOrgId` links the tenant to a WorkOS Organization when
   * one was created or is already associated with the session; it is null
   * when the directory was unavailable.
   */
  createOrganizationWithAdmin(input: {
    organizationName: string;
    workosOrgId?: string | null;
    workosUserId: string;
    email: string;
    firstName?: string;
    lastName?: string;
  }): Promise<UserWithAccess>;
}
