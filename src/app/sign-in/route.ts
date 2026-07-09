import { redirect } from 'next/navigation';
import { hostedSignInUrl } from '@/lib/auth/urls';

/**
 * Forwards to WorkOS hosted sign-in. A route handler (not a page) because
 * generating the authorization URL sets the PKCE cookie, which is only
 * allowed in route handlers, server actions, and middleware.
 */
export async function GET(): Promise<Response> {
  redirect(await hostedSignInUrl());
}
