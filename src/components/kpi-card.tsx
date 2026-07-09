import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: 'default' | 'positive' | 'warning';
  loading?: boolean;
}) {
  return (
    <Card className="gap-0 rounded-xl py-0 shadow-xs">
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0 space-y-1">
          <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <p className="truncate text-[26px] font-semibold leading-tight tracking-tight tabular-nums">
              {value}
            </p>
          )}
          {hint && !loading && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            tone === 'default' && 'bg-primary/10 text-primary',
            tone === 'positive' && 'bg-emerald-500/10 text-emerald-600',
            tone === 'warning' && 'bg-amber-500/10 text-amber-600',
          )}
        >
          <Icon className="size-[18px]" />
        </div>
      </CardContent>
    </Card>
  );
}
