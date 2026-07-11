/**
 * Port over the external identity provider's *directory* (WorkOS
 * Organizations), used only during onboarding to back a Storex tenant with a
 * WorkOS Organization. Kept separate from IdentityRepository (which is our
 * own database) because this talks to a third party and must degrade
 * gracefully when that provider is unavailable.
 */
export interface AuthDirectory {
  /**
   * Best-effort creation of a WorkOS Organization for a new tenant. Returns
   * the WorkOS organization id, or `null` when the directory is unavailable
   * (e.g. local development with placeholder credentials, or free-tier
   * limits). Onboarding must still succeed when this returns null — the
   * tenant is simply not yet linked to a WorkOS Organization.
   */
  createOrganization(name: string): Promise<string | null>;
}
