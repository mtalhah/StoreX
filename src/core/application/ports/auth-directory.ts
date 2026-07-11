import type { UserRole } from '@/core/domain/enums';

/**
 * Port over the external identity provider's *directory* (WorkOS
 * Organizations / User Management), used to back a Storex tenant with a
 * WorkOS Organization and to invite the users an Admin provisions locally.
 * Kept separate from IdentityRepository (which is our own database) because
 * this talks to a third party.
 *
 * Failure policy is uniform across every method here and lives entirely
 * inside the implementation (see WorkosAuthDirectory): in production a
 * failure throws, because Storex must never end up in a state that's silently
 * unreachable from WorkOS (an unlinked tenant, a zero-member Organization, an
 * invitation that was never actually sent). In local/dev it degrades to the
 * documented fallback so the app stays usable without real WorkOS
 * credentials. Application services never branch on NODE_ENV themselves —
 * they just call the port and handle a result, a fallback, or a thrown error.
 */

export interface SentInvitation {
  id: string;
  token: string;
  acceptUrl: string;
}

export interface SendInvitationInput {
  /** The tenant's WorkOS Organization id. Null means the tenant has no linked WorkOS Organization (can't invite). */
  organizationId: string | null;
  email: string;
  roleSlug: string;
  /** WorkOS user id of the admin sending the invite, when known. */
  inviterWorkosUserId?: string;
}

export interface AddOrganizationMembershipInput {
  organizationId: string;
  workosUserId: string;
  roleSlug?: string;
}

/**
 * Maps Storex's local RBAC roles to WorkOS Organization role slugs. Storex's
 * own `role` column remains authoritative for app permissions regardless of
 * whether these slugs are configured as WorkOS Organization Roles — if
 * WorkOS rejects an unrecognized slug, WorkosAuthDirectory retries once
 * without one rather than failing the invitation.
 */
export const WORKOS_ROLE_SLUGS: Record<UserRole, string> = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  OPERATOR: 'operator',
};

export interface AuthDirectory {
  /**
   * Creates a WorkOS Organization for a new tenant. In local/dev, failures
   * degrade to null (onboarding still succeeds, unlinked). In production,
   * failures throw — a production tenant must end up linked to WorkOS so it
   * can invite users later.
   */
  createOrganization(name: string): Promise<string | null>;

  /**
   * Adds a member to a WorkOS Organization right after creating it, so
   * onboarding never leaves a zero-member Organization behind. Same
   * production-throws / local-dev-degrades policy as createOrganization.
   */
  addOrganizationMembership(input: AddOrganizationMembershipInput): Promise<boolean>;

  /**
   * Sends a WorkOS invitation for the tenant's Organization so an
   * admin-provisioned user can accept it, join the WorkOS Organization, and
   * later be linked to their already-provisioned Storex user by email on
   * first sign-in. In local/dev, failures — including having no linked WorkOS
   * Organization — degrade to null and Storex proceeds with local-only
   * provisioning. In production, failures throw — UserService refuses to
   * create a user without a real invitation.
   */
  sendInvitation(input: SendInvitationInput): Promise<SentInvitation | null>;
}
