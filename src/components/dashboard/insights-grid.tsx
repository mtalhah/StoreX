'use client';

import type { ColDef, RowClickedEvent } from 'ag-grid-community';
import useSWR from 'swr';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataGrid } from '@/components/data-grid';
import { RowDetailsDialog } from '@/components/row-details-dialog';
import type { InventoryInsightRow, StockStatus } from '@/core/application/ports/analytics-repository';
import { swrFetcher, type ApiResult } from '@/lib/client/api';
import { useIsMobile } from '@/lib/client/use-is-mobile';
import { formatDateTime, formatNumber, STATUS_LABELS } from '@/lib/format';

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

export function InsightsGrid() {
  const isMobile = useIsMobile();
  const { data, isLoading } = useSWR<ApiResult<InventoryInsightRow[]>>(
    '/api/v1/analytics/insights',
    swrFetcher<InventoryInsightRow[]>,
    { refreshInterval: 60_000 },
  );
  const rows = data?.data ?? [];

  const [viewing, setViewing] = useState<InventoryInsightRow | null>(null);

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
        field: 'inbound30d',
        headerName: 'In · 30d',
        type: 'rightAligned',
        valueFormatter: (p) => formatNumber(p.value ?? 0),
        maxWidth: 110,
      },
      {
        field: 'outbound30d',
        headerName: 'Out · 30d',
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
  }, [isMobile]);

  const handleRowClicked = (event: RowClickedEvent<InventoryInsightRow>) => {
    if (!isMobile || !event.data) return;
    setViewing(event.data);
  };

  if (!isLoading && rows.length === 0) return null;

  return (
    <Card className="flex h-full flex-col gap-2 rounded-xl py-4 shadow-xs">
      <CardHeader className="px-5 py-0">
        <CardTitle className="text-sm font-medium">Inventory insights</CardTitle>
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
                { label: 'In · 30d', value: formatNumber(viewing.inbound30d) },
                { label: 'Out · 30d', value: formatNumber(viewing.outbound30d) },
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
