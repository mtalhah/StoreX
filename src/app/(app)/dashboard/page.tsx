import type { Metadata } from 'next';
import { Permission } from '@/core/application/auth/permissions';
import { DashboardView } from '@/components/dashboard/dashboard-view';
import { requirePagePermission } from '@/lib/auth/guards';

export const metadata: Metadata = { title: 'Dashboard' };

/**
 * KPI dashboard. Data comes from the /api/v1/analytics endpoints, which read
 * from BigQuery (OLAP) — never from the transactional database.
 */
export default async function DashboardPage() {
  await requirePagePermission(Permission.AnalyticsRead);
  return <DashboardView />;
}
