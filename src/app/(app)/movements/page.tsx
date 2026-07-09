import type { Metadata } from 'next';
import { Permission } from '@/core/application/auth/permissions';
import { MovementsView } from '@/components/movements/movements-view';
import { requirePagePermission } from '@/lib/auth/guards';

export const metadata: Metadata = { title: 'Stock Movements' };

export default async function MovementsPage() {
  await requirePagePermission(Permission.MovementsRead);
  return <MovementsView />;
}
