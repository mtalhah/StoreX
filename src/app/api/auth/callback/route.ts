import { handleAuth } from '@workos-inc/authkit-nextjs';

/**
 * Public origin of the app (scheme + host, no path).
 *
 * Behind a TLS-terminating proxy like Cloud Run, the Next.js standalone
 * server binds `0.0.0.0:8080` and `request.nextUrl` reports that internal
 * address rather than the public hostname. AuthKit's `handleAuth` builds the
 * post-sign-in redirect from `request.nextUrl` unless a `baseURL` is given,
 * which is why an unset baseURL sends users to `https://0.0.0.0:8080/dashboard`.
 *
 * We derive the origin from `WORKOS_REDIRECT_URI` — it's already required, and
 * it must equal the real public callback URL registered in WorkOS, so it is
 * always the correct public origin (including a custom domain, if used).
 * `APP_BASE_URL` can override it for unusual setups. Left undefined in local
 * dev, where `handleAuth` correctly falls back to the request URL.
 */
function appBaseURL(): string | undefined {
  const override = process.env.APP_BASE_URL;
  if (override) return override;

  const redirectUri = process.env.WORKOS_REDIRECT_URI;
  if (!redirectUri) return undefined;
  try {
    return new URL(redirectUri).origin;
  } catch {
    return undefined;
  }
}

/**
 * OAuth callback: AuthKit exchanges the code, seals the session into an
 * encrypted cookie, and redirects. User provisioning happens lazily on the
 * first authenticated request (see lib/auth/session.ts), not here — the
 * callback stays a pure auth concern.
 */
export const GET = handleAuth({ returnPathname: '/dashboard', baseURL: appBaseURL() });
