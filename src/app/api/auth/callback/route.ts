import { handleAuth } from '@workos-inc/authkit-nextjs';

/**
 * OAuth callback: AuthKit exchanges the code, seals the session into an
 * encrypted cookie, and redirects. User provisioning happens lazily on the
 * first authenticated request (see lib/auth/session.ts), not here — the
 * callback stays a pure auth concern.
 */
export const GET = handleAuth({ returnPathname: '/dashboard' });
