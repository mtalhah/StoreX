'use client';

import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { WarehouseUtilizationRow } from '@/core/application/ports/analytics-repository';
import { swrFetcher, type ApiResult } from '@/lib/client/api';
import { cn } from '@/lib/utils';
import { formatNumber, formatPercent } from '@/lib/format';

export function UtilizationPanel({ className }: { className?: string }) {
  const { data, isLoading } = useSWR<ApiResult<WarehouseUtilizationRow[]>>(
    '/api/v1/analytics/utilization',
    swrFetcher<WarehouseUtilizationRow[]>,
    { refreshInterval: 60_000 },
  );
  const rows = data?.data ?? [];

  return (
    <Card className={cn('flex h-full flex-col gap-2 rounded-xl py-4 shadow-xs', className)}>
      <CardHeader className="px-5 py-0">
        <CardTitle className="text-sm font-medium">Warehouse utilization</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-1">
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
        {!isLoading && rows.length === 0 && (
          <p className="pt-4 text-center text-sm text-muted-foreground">No warehouses yet.</p>
        )}
        {rows.map((row) => {
          const pct = Math.min(100, row.utilizationPct);
          const critical = row.utilizationPct >= 90;
          return (
            <div key={row.warehouseId} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium">{row.warehouseName}</span>
                <span
                  className={cn(
                    'shrink-0 text-xs tabular-nums',
                    critical ? 'font-semibold text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {formatPercent(row.utilizationPct)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full', critical ? 'bg-destructive' : 'bg-primary')}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {formatNumber(row.usedCapacity)} / {formatNumber(row.capacity)} storage units ·{' '}
                {formatNumber(row.skuCount)} SKUs
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
