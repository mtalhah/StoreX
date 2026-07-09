'use server';

import { signOut } from '@workos-inc/authkit-nextjs';

export async function signOutAction(): Promise<void> {
  await signOut({ returnTo: '/' });
}
