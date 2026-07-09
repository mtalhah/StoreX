import type { Metadata } from 'next';
import { Permission } from '@/core/application/auth/permissions';
import { UsersView } from '@/components/users/users-view';
import { requirePagePermission } from '@/lib/auth/guards';

export const metadata: Metadata = { title: 'Users' };

export default async function UsersPage() {
  const ctx = await requirePagePermission(Permission.UsersManage);
  return <UsersView currentUserId={ctx.userId} />;
}
