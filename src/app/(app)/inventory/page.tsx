import type { Metadata } from 'next';
import { Permission } from '@/core/application/auth/permissions';
import { InventoryView } from '@/components/inventory/inventory-view';
import { requirePagePermission } from '@/lib/auth/guards';

export const metadata: Metadata = { title: 'Inventory' };

export default async function InventoryPage() {
  await requirePagePermission(Permission.InventoryRead);
  return <InventoryView />;
}
