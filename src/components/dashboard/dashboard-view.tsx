'use client';

import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Boxes, Gauge } from 'lucide-react';
import useSWR from 'swr';
import { useState } from 'react';
import { KpiCard } from '@/components/kpi-card';
import { PageHeader } from '@/components/page-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DashboardKpis } from '@/core/application/ports/analytics-repository';
import { swrFetcher, type ApiResult } from '@/lib/client/api';
import { formatNumber, formatPercent } from '@/lib/format';
import { InsightsGrid } from './insights-grid';
import { TrendChart } from './trend-chart';
import { UtilizationPanel } from './utilization-panel';

const PERIOD_OPTIONS = [7, 30, 90, 180] as const;
const PERIOD_LABELS: Record<string, string> = {
  '7': 'Last 7 days',
  '30': 'Last 30 days',
  '90': 'Last 90 days',
  '180': 'Last 180 days',
};

/**
 * Viewport-fit dashboard: KPI row + charts row are fixed-height, the
 * insights grid takes the remaining space and scrolls internally — the page
 * itself never scrolls.
 */
export function DashboardView() {
  const [days, setDays] = useState<number>(30);
  const { data, isLoading } = useSWR<ApiResult<DashboardKpis>>(
    `/api/v1/analytics/kpis?days=${days}`,
    swrFetcher<DashboardKpis>,
    { refreshInterval: 300_000 },
  );
  const kpis = data?.data;

  return (
    // Desktop (lg+) keeps the original viewport-fit layout (fixed height,
    // internal scrolling). Below lg the dashboard flows to its natural height
    // and the page scrolls, so nothing gets crushed on a phone.
    <div className="flex min-h-full flex-col gap-4 p-4 md:p-6 lg:h-full lg:min-h-0">
      <PageHeader
        title="Dashboard"
        description="Real-time visibility into stock levels, movement, and warehouse utilization."
      >
        <Select value={String(days)} onValueChange={(v) => v && setDays(Number(v))}>
          <SelectTrigger className="w-full bg-card sm:w-auto">
            <SelectValue>{(v: string) => PERIOD_LABELS[v] ?? 'Last 30 days'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((d) => (
              <SelectItem key={d} value={String(d)}>
                {PERIOD_LABELS[String(d)]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageHeader>

      <div className="grid shrink-0 grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard
          label="Units on hand"
          value={formatNumber(kpis?.totalStockUnits ?? 0)}
          hint={`${formatNumber(kpis?.activeSkus ?? 0)} active SKUs`}
          icon={Boxes}
          loading={isLoading}
        />
        <KpiCard
          label={`Inbound · ${days}d`}
          value={formatNumber(kpis?.inboundInPeriod ?? 0)}
          hint={`${formatNumber(kpis?.outboundInPeriod ?? 0)} outbound`}
          icon={ArrowDownToLine}
          tone="positive"
          loading={isLoading}
        />
        <KpiCard
          label="Movement velocity"
          value={`${formatNumber(kpis?.movementVelocity ?? 0)}/day`}
          hint={`Average over the last ${days} days`}
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

      <div className="grid shrink-0 grid-cols-1 gap-4 lg:h-[240px] lg:grid-cols-3">
        <TrendChart className="h-[280px] lg:col-span-2 lg:h-full" days={days} />
        <UtilizationPanel className="h-[280px] lg:h-full" />
      </div>

      {/* Fixed, internally-scrolling height on phones/tablets; fills the
          remaining viewport on desktop exactly as before. */}
      <div className="h-[70vh] min-h-[420px] lg:h-auto lg:min-h-0 lg:flex-1">
        <InsightsGrid days={days} />
      </div>
    </div>
  );
}
