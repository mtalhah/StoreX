import { authkitProxy } from '@workos-inc/authkit-nextjs';

/**
 * Session middleware (Next.js 16 "proxy"). AuthKit verifies/refreshes the
 * sealed session cookie on every matched request and redirects
 * unauthenticated users to WorkOS-hosted sign-in.
 *
 * This is deliberately the *outermost* gate only. Authorization (roles,
 * tenant scope) is enforced again in the API layer and structurally in the
 * repository layer — the middleware existing or not must never be the
 * difference between isolated and leaked tenant data.
 */
export default authkitProxy({
  // Passed explicitly (not via NEXT_PUBLIC_*) so the value is read from the
  // runtime environment on Cloud Run instead of being inlined at build time.
  redirectUri: process.env.WORKOS_REDIRECT_URI,
  middlewareAuth: {
    enabled: true,
    // REST endpoints are excluded from the redirect behavior on purpose:
    // withApi() answers 401/403 as JSON, which is what programmatic clients
    // expect. Session verification still happens there via withAuth() — the
    // middleware redirect is a browser convenience, not the security gate.
    unauthenticatedPaths: ['/', '/sign-in', '/api/auth/callback', '/api/v1/:path*'],
  },
});

export const config = {
  // Everything except static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
