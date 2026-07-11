import type { AuthDirectory } from '@/core/application/ports/auth-directory';

/**
 * WorkOS-backed AuthDirectory. Creates a WorkOS Organization for a new tenant.
 *
 * `@workos-inc/authkit-nextjs` only resolves inside the Next.js runtime (it
 * ships conditional `react-server` exports), so it is imported dynamically
 * here — that keeps this module, and the composition root that references it,
 * importable from plain Node/tsx contexts such as the smoke test.
 *
 * All failures are swallowed and reported as `null`: onboarding must not be
 * blocked by the directory being unreachable (placeholder dev credentials,
 * network, or plan limits).
 */
export class WorkosAuthDirectory implements AuthDirectory {
  async createOrganization(name: string): Promise<string | null> {
    try {
      const { getWorkOS } = await import('@workos-inc/authkit-nextjs');
      const workos = getWorkOS();
      const organization = await workos.organizations.createOrganization({ name });
      return organization.id;
    } catch (error) {
      console.warn(
        '[onboarding] WorkOS organization creation unavailable; the tenant was created without a linked WorkOS organization.',
        error,
      );
      return null;
    }
  }
}
