import type { Metadata } from 'next';
import { Permission } from '@/core/application/auth/permissions';
import { WarehousesView } from '@/components/warehouses/warehouses-view';
import { requirePagePermission } from '@/lib/auth/guards';

export const metadata: Metadata = { title: 'Warehouses' };

export default async function WarehousesPage() {
  await requirePagePermission(Permission.WarehousesRead);
  return <WarehousesView />;
}
