'use client';

import useSWR from 'swr';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { MovementTrendPoint } from '@/core/application/ports/analytics-repository';
import { swrFetcher, type ApiResult } from '@/lib/client/api';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

const INBOUND = 'var(--chart-1)';
const OUTBOUND = 'var(--chart-4)';

export function TrendChart({ className, days }: { className?: string; days: number }) {
  const { data, isLoading } = useSWR<ApiResult<MovementTrendPoint[]>>(
    `/api/v1/analytics/trend?days=${days}`,
    swrFetcher<MovementTrendPoint[]>,
    { refreshInterval: 300_000 },
  );
  const points = (data?.data ?? []).map((p) => ({
    ...p,
    label: new Date(`${p.date}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }),
  }));

  return (
    <Card className={cn('flex h-full flex-col gap-2 rounded-xl py-4 shadow-xs', className)}>
      <CardHeader className="px-5 py-0">
        <CardTitle className="flex items-baseline justify-between text-sm font-medium">
          <span>Inbound vs outbound (storage units) · {days} days</span>
          <span className="flex items-center gap-3 text-xs font-normal text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: INBOUND }} /> Inbound
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: OUTBOUND }} /> Outbound
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-2 pb-0">
        {isLoading ? (
          <Skeleton className="m-3 h-[85%]" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 12, left: -14, bottom: 0 }}>
              <defs>
                <linearGradient id="inboundFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={INBOUND} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={INBOUND} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="outboundFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={OUTBOUND} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={OUTBOUND} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={28}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={52}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickFormatter={(value: number) => formatNumber(value)}
              />
              <Tooltip
                cursor={{ stroke: 'var(--border)' }}
                formatter={(value) => formatNumber(Number(value))}
                contentStyle={{
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  boxShadow: '0 4px 16px rgb(0 0 0 / 0.06)',
                  fontSize: 12,
                }}
              />
              <Area type="monotone" dataKey="inbound" stroke={INBOUND} strokeWidth={2} fill="url(#inboundFill)" name="Inbound" />
              <Area type="monotone" dataKey="outbound" stroke={OUTBOUND} strokeWidth={2} fill="url(#outboundFill)" name="Outbound" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
