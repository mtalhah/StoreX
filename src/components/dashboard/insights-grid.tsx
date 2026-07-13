'use client';

import type { ColDef, RowClickedEvent } from 'ag-grid-community';
import { Filter } from 'lucide-react';
import useSWR from 'swr';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataGrid } from '@/components/data-grid';
import { RowDetailsDialog } from '@/components/row-details-dialog';
import type {
  InventoryInsightRow,
  StockStatus,
} from '@/core/application/ports/analytics-repository';
import { swrFetcher, type ApiResult } from '@/lib/client/api';
import { useIsMobile } from '@/lib/client/use-is-mobile';
import { useWarehouseOptions } from '@/lib/client/use-warehouse-options';
import { formatDateTime, formatNumber, STATUS_LABELS } from '@/lib/format';

const ALL = 'all';

const STATUS_STYLES: Record<StockStatus, string> = {
  LOW_STOCK: 'bg-red-500/10 text-red-600 border-red-200',
  DEAD_STOCK: 'bg-zinc-500/10 text-zinc-600 border-zinc-200',
  FAST_MOVER: 'bg-blue-500/10 text-blue-600 border-blue-200',
  HEALTHY: 'bg-emerald-500/10 text-emerald-600 border-emerald-200',
};

function StatusBadge({ value }: { value: StockStatus }) {
  return (
    <Badge variant="outline" className={STATUS_STYLES[value]}>
      {STATUS_LABELS[value]}
    </Badge>
  );
}

interface InsightFilters {
  warehouseId: string;
  status: string;
  lastMovementFrom: string;
  lastMovementTo: string;
}

const EMPTY_FILTERS: InsightFilters = {
  warehouseId: '',
  status: '',
  lastMovementFrom: '',
  lastMovementTo: '',
};

export function InsightsGrid({ days }: { days: number }) {
  const isMobile = useIsMobile();
  const { warehouses } = useWarehouseOptions();
  const [filters, setFilters] = useState<InsightFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pending, setPending] = useState<InsightFilters>(EMPTY_FILTERS);
  const [viewing, setViewing] = useState<InventoryInsightRow | null>(null);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const query = useMemo(() => {
    const params = new URLSearchParams({ days: String(days) });
    if (filters.warehouseId) params.set('warehouseId', filters.warehouseId);
    if (filters.status) params.set('status', filters.status);
    if (filters.lastMovementFrom) params.set('lastMovementFrom', filters.lastMovementFrom);
    if (filters.lastMovementTo) params.set('lastMovementTo', filters.lastMovementTo);
    return `/api/v1/analytics/insights?${params.toString()}`;
  }, [days, filters]);

  const { data, isLoading } = useSWR<ApiResult<InventoryInsightRow[]>>(
    query,
    swrFetcher<InventoryInsightRow[]>,
    { refreshInterval: 300_000 },
  );
  const rows = data?.data ?? [];

  const openFilters = (open: boolean) => {
    if (open) setPending(filters);
    setFiltersOpen(open);
  };

  const applyFilters = () => {
    setFilters(pending);
    setFiltersOpen(false);
  };

  const clearFilters = () => {
    setPending(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setFiltersOpen(false);
  };

  const columnDefs = useMemo<ColDef<InventoryInsightRow>[]>(() => {
    if (isMobile) {
      return [
        { field: 'warehouseName', headerName: 'Warehouse', minWidth: 130, flex: 1 },
        { field: 'itemName', headerName: 'Item', minWidth: 130, flex: 1 },
        {
          field: 'status',
          headerName: 'Status',
          minWidth: 110,
          cellRenderer: (p: { value: StockStatus }) => <StatusBadge value={p.value} />,
        },
      ];
    }
    return [
      { field: 'warehouseName', headerName: 'Warehouse', minWidth: 170 },
      { field: 'sku', headerName: 'SKU', minWidth: 120 },
      { field: 'itemName', headerName: 'Item', minWidth: 200, flex: 2 },
      {
        field: 'quantity',
        headerName: 'On hand',
        type: 'rightAligned',
        valueFormatter: (p) => formatNumber(p.value ?? 0),
        maxWidth: 120,
      },
      {
        field: 'inboundInPeriod',
        headerName: `In · ${days}d`,
        type: 'rightAligned',
        valueFormatter: (p) => formatNumber(p.value ?? 0),
        maxWidth: 110,
      },
      {
        field: 'outboundInPeriod',
        headerName: `Out · ${days}d`,
        type: 'rightAligned',
        valueFormatter: (p) => formatNumber(p.value ?? 0),
        maxWidth: 110,
      },
      {
        field: 'lastMovementAt',
        headerName: 'Last movement',
        minWidth: 150,
        valueFormatter: (p) => (p.value ? formatDateTime(p.value) : '—'),
      },
      {
        field: 'status',
        headerName: 'Status',
        minWidth: 130,
        cellRenderer: (p: { value: StockStatus }) => <StatusBadge value={p.value} />,
      },
    ];
  }, [isMobile, days]);

  const handleRowClicked = (event: RowClickedEvent<InventoryInsightRow>) => {
    if (!isMobile || !event.data) return;
    setViewing(event.data);
  };

  return (
    <Card className="flex h-full flex-col gap-2 rounded-xl py-4 shadow-xs">
      <CardHeader className="px-5 py-0">
        <CardTitle className="text-sm font-medium">Inventory insights</CardTitle>
        <CardAction>
          <Popover open={filtersOpen} onOpenChange={openFilters}>
            <PopoverTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
              <Filter className="size-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent className="w-80 max-w-[calc(100vw-2rem)]" align="end">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Warehouse</Label>
                  <Select
                    value={pending.warehouseId || ALL}
                    onValueChange={(v) =>
                      setPending((p) => ({ ...p, warehouseId: !v || v === ALL ? '' : v }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v: string) =>
                          v === ALL
                            ? 'All warehouses'
                            : (warehouses.find((w) => w.id === v)?.name ?? 'All warehouses')
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All warehouses</SelectItem>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select
                    value={pending.status || ALL}
                    onValueChange={(v) =>
                      setPending((p) => ({ ...p, status: !v || v === ALL ? '' : v }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v: string) =>
                          v === ALL ? 'All statuses' : (STATUS_LABELS[v] ?? 'All statuses')
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All statuses</SelectItem>
                      {(Object.keys(STATUS_STYLES) as StockStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="if-last-from">Last movement from</Label>
                    <Input
                      id="if-last-from"
                      type="date"
                      value={pending.lastMovementFrom}
                      onChange={(e) =>
                        setPending((p) => ({ ...p, lastMovementFrom: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="if-last-to">Last movement to</Label>
                    <Input
                      id="if-last-to"
                      type="date"
                      value={pending.lastMovementTo}
                      onChange={(e) =>
                        setPending((p) => ({ ...p, lastMovementTo: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                    Clear
                  </Button>
                  <Button type="button" size="sm" onClick={applyFilters}>
                    Apply
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-4 pb-1">
        <DataGrid
          columnDefs={columnDefs}
          rows={rows}
          loading={isLoading}
          gridOptions={
            isMobile
              ? { onRowClicked: handleRowClicked, rowStyle: { cursor: 'pointer' } }
              : undefined
          }
        />
      </CardContent>
      <RowDetailsDialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewing?.itemName ?? ''}
        fields={
          viewing
            ? [
                { label: 'Warehouse', value: viewing.warehouseName },
                { label: 'SKU', value: viewing.sku },
                { label: 'Item', value: viewing.itemName },
                { label: 'On hand', value: formatNumber(viewing.quantity) },
                { label: `In · ${days}d`, value: formatNumber(viewing.inboundInPeriod) },
                { label: `Out · ${days}d`, value: formatNumber(viewing.outboundInPeriod) },
                {
                  label: 'Last movement',
                  value: viewing.lastMovementAt ? formatDateTime(viewing.lastMovementAt) : '—',
                },
                { label: 'Status', value: <StatusBadge value={viewing.status} /> },
              ]
            : []
        }
      />
    </Card>
  );
}
