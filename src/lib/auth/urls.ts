import 'server-only';
import { getSignInUrl } from '@workos-inc/authkit-nextjs';

/**
 * Hosted sign-in URL with the redirect URI passed explicitly from the
 * server-side environment. AuthKit's own env fallback uses a NEXT_PUBLIC_
 * variable, which Next.js inlines at build time — unusable when the image is
 * built once and configured per environment (Cloud Run).
 */
export function hostedSignInUrl(): Promise<string> {
  return getSignInUrl({ redirectUri: process.env.WORKOS_REDIRECT_URI });
}
