import type { Metadata } from 'next';
import { WarehousesView } from '@/components/warehouses/warehouses-view';
import { requireWarehousesSection } from '@/lib/auth/guards';

export const metadata: Metadata = { title: 'Warehouses' };

export default async function WarehousesPage() {
  // Section visibility is role + assignment based (admins always, managers
  // only when running >1 warehouse, operators never), not a plain permission.
  await requireWarehousesSection();
  return <WarehousesView />;
}
