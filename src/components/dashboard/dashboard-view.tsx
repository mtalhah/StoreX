'use client';

import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Boxes, Gauge } from 'lucide-react';
import useSWR from 'swr';
import { KpiCard } from '@/components/kpi-card';
import { PageHeader } from '@/components/page-header';
import type { DashboardKpis } from '@/core/application/ports/analytics-repository';
import { swrFetcher, type ApiResult } from '@/lib/client/api';
import { formatNumber, formatPercent } from '@/lib/format';
import { InsightsGrid } from './insights-grid';
import { TrendChart } from './trend-chart';
import { UtilizationPanel } from './utilization-panel';

/**
 * Viewport-fit dashboard: KPI row + charts row are fixed-height, the
 * insights grid takes the remaining space and scrolls internally — the page
 * itself never scrolls.
 */
export function DashboardView({ scopeLabel }: { scopeLabel: string }) {
  const { data, isLoading } = useSWR<ApiResult<DashboardKpis>>(
    '/api/v1/analytics/kpis',
    swrFetcher<DashboardKpis>,
    { refreshInterval: 60_000 },
  );
  const kpis = data?.data;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-6">
      <PageHeader
        title="Dashboard"
        description={`Analytics for your ${scopeLabel} — served from BigQuery.`}
      />

      <div className="grid shrink-0 grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard
          label="Units on hand"
          value={formatNumber(kpis?.totalStockUnits ?? 0)}
          hint={`${formatNumber(kpis?.activeSkus ?? 0)} active SKUs`}
          icon={Boxes}
          loading={isLoading}
        />
        <KpiCard
          label="Inbound · 30d"
          value={formatNumber(kpis?.inbound30d ?? 0)}
          hint={`${formatNumber(kpis?.outbound30d ?? 0)} outbound`}
          icon={ArrowDownToLine}
          tone="positive"
          loading={isLoading}
        />
        <KpiCard
          label="Movement velocity"
          value={`${kpis?.movementVelocity30d ?? 0}/day`}
          hint="Average over the last 30 days"
          icon={ArrowUpFromLine}
          loading={isLoading}
        />
        <KpiCard
          label="Utilization"
          value={formatPercent(kpis?.utilizationPct ?? 0)}
          hint={
            kpis && kpis.lowStockCount > 0
              ? `${formatNumber(kpis.lowStockCount)} SKUs low on stock`
              : 'Capacity in healthy range'
          }
          icon={kpis && kpis.lowStockCount > 0 ? AlertTriangle : Gauge}
          tone={kpis && kpis.lowStockCount > 0 ? 'warning' : 'default'}
          loading={isLoading}
        />
      </div>

      <div className="grid h-[240px] shrink-0 grid-cols-1 gap-4 lg:grid-cols-3">
        <TrendChart className="lg:col-span-2" />
        <UtilizationPanel />
      </div>

      <div className="min-h-0 flex-1">
        <InsightsGrid />
      </div>
    </div>
  );
}
