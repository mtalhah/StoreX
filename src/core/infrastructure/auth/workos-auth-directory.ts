import type {
  AddOrganizationMembershipInput,
  AuthDirectory,
  SendInvitationInput,
  SentInvitation,
} from '@/core/application/ports/auth-directory';

const isProduction = () => process.env.NODE_ENV === 'production';

/** Heuristic: WorkOS SDK exceptions carry a human-readable `.message`. */
function isRoleSlugRejection(error: unknown): boolean {
  return error instanceof Error && /role/i.test(error.message);
}

/**
 * WorkOS-backed AuthDirectory. Creates/links WorkOS Organizations and sends
 * WorkOS Organization invitations.
 *
 * `@workos-inc/authkit-nextjs` only resolves inside the Next.js runtime (it
 * ships conditional `react-server` exports), so it is imported dynamically
 * here — that keeps this module, and the composition root that references it,
 * importable from plain Node/tsx contexts such as the smoke test.
 */
export class WorkosAuthDirectory implements AuthDirectory {
  async createOrganization(name: string): Promise<string | null> {
    try {
      const { getWorkOS } = await import('@workos-inc/authkit-nextjs');
      const workos = getWorkOS();
      const organization = await workos.organizations.createOrganization({ name });
      return organization.id;
    } catch (error) {
      return this.degrade(error, 'create the WorkOS organization', null);
    }
  }

  async addOrganizationMembership(input: AddOrganizationMembershipInput): Promise<boolean> {
    try {
      const { getWorkOS } = await import('@workos-inc/authkit-nextjs');
      const workos = getWorkOS();
      await this.withRoleSlugFallback(input.roleSlug, (roleSlug) =>
        workos.userManagement.createOrganizationMembership({
          organizationId: input.organizationId,
          userId: input.workosUserId,
          roleSlug,
        }),
      );
      return true;
    } catch (error) {
      return this.degrade(error, 'add the WorkOS organization membership', false);
    }
  }

  async sendInvitation(input: SendInvitationInput): Promise<SentInvitation | null> {
    if (!input.organizationId) {
      return this.degrade(
        new Error('This organization has no linked WorkOS Organization.'),
        `send a WorkOS invitation to ${input.email}`,
        null,
      );
    }
    const organizationId = input.organizationId;
    try {
      const { getWorkOS } = await import('@workos-inc/authkit-nextjs');
      const workos = getWorkOS();
      const invitation = await this.withRoleSlugFallback(input.roleSlug, (roleSlug) =>
        workos.userManagement.sendInvitation({
          email: input.email,
          organizationId,
          roleSlug,
          inviterUserId: input.inviterWorkosUserId,
        }),
      );
      return { id: invitation.id, token: invitation.token, acceptUrl: invitation.acceptInvitationUrl };
    } catch (error) {
      return this.degrade(error, `send a WorkOS invitation to ${input.email}`, null);
    }
  }

  /**
   * Retries once without a role slug if WorkOS rejects it as unrecognized
   * (e.g. the role hasn't been configured in the WorkOS dashboard yet) —
   * Storex's own role stays authoritative for app permissions either way.
   */
  private async withRoleSlugFallback<T>(
    roleSlug: string | undefined,
    call: (roleSlug?: string) => Promise<T>,
  ): Promise<T> {
    try {
      return await call(roleSlug);
    } catch (error) {
      if (roleSlug && isRoleSlugRejection(error)) {
        console.warn(`[workos] role slug '${roleSlug}' was rejected; retrying without a role.`, error);
        return call(undefined);
      }
      throw error;
    }
  }

  /**
   * Shared failure policy: in production, a WorkOS directory failure stops
   * the caller (thrown as a plain Error; application services wrap it as a
   * DomainError) so Storex never ends up in a state that's silently
   * unreachable from WorkOS. In local/dev, it degrades to the given fallback
   * so the app stays usable without real WorkOS credentials.
   */
  private degrade<T>(error: unknown, action: string, fallback: T): T {
    if (isProduction()) {
      console.error(`[workos] Failed to ${action}; failing the request.`, error);
      throw new Error(`Failed to ${action}.`, { cause: error });
    }
    console.warn(`[workos] Failed to ${action}; continuing without it (local/dev).`, error);
    return fallback;
  }
}
