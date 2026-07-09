'use client';

import type { ColDef } from 'ag-grid-community';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataGrid } from '@/components/data-grid';
import { PageHeader } from '@/components/page-header';
import { Permission } from '@/core/application/auth/permissions';
import type { MovementRow } from '@/lib/client/types';
import { useMe } from '@/lib/client/use-me';
import { usePaginated } from '@/lib/client/use-paginated';
import { useWarehouseOptions } from '@/lib/client/use-warehouse-options';
import { formatDateTime, formatNumber } from '@/lib/format';
import { RecordMovementDialog } from './record-movement-dialog';

const ALL = 'all';

function TypeBadge({ value }: { value: 'INBOUND' | 'OUTBOUND' }) {
  return value === 'INBOUND' ? (
    <Badge variant="outline" className="border-emerald-200 bg-emerald-500/10 text-emerald-600">
      Inbound
    </Badge>
  ) : (
    <Badge variant="outline" className="border-amber-200 bg-amber-500/10 text-amber-600">
      Outbound
    </Badge>
  );
}

export function MovementsView() {
  const { can } = useMe();
  const { warehouses } = useWarehouseOptions();
  const list = usePaginated<MovementRow>('/api/v1/movements', {
    sortBy: 'occurredAt',
    sortDir: 'desc',
  });
  const [recording, setRecording] = useState(false);

  const columnDefs = useMemo<ColDef<MovementRow>[]>(
    () => [
      {
        field: 'occurredAt',
        headerName: 'When',
        minWidth: 150,
        valueFormatter: (p) => (p.value ? formatDateTime(p.value) : ''),
      },
      {
        field: 'type',
        headerName: 'Type',
        maxWidth: 130,
        cellRenderer: (p: { value: 'INBOUND' | 'OUTBOUND' }) => <TypeBadge value={p.value} />,
      },
      { field: 'sku', headerName: 'SKU', minWidth: 120, sortable: false },
      { field: 'itemName', headerName: 'Item', minWidth: 200, flex: 2, sortable: false },
      {
        field: 'quantity',
        headerName: 'Qty',
        type: 'rightAligned',
        maxWidth: 110,
        valueFormatter: (p) =>
          `${p.data?.type === 'OUTBOUND' ? '−' : '+'}${formatNumber(p.value ?? 0)}`,
        cellClass: (p) => (p.data?.type === 'OUTBOUND' ? 'text-amber-600' : 'text-emerald-600'),
      },
      { field: 'warehouseName', headerName: 'Warehouse', minWidth: 160, sortable: false },
      { field: 'createdByName', headerName: 'Recorded by', minWidth: 150, sortable: false },
      {
        field: 'note',
        headerName: 'Note',
        minWidth: 140,
        sortable: false,
        valueFormatter: (p) => p.value ?? '',
      },
    ],
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-6">
      <PageHeader title="Stock movements" description="The immutable ledger behind every quantity.">
        <Select
          value={list.state.filters.warehouseId || ALL}
          onValueChange={(v) => list.setFilter('warehouseId', !v || v === ALL ? '' : v)}
        >
          <SelectTrigger className="w-52 bg-card">
            <SelectValue placeholder="All warehouses" />
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
        <Select
          value={list.state.filters.type || ALL}
          onValueChange={(v) => list.setFilter('type', !v || v === ALL ? '' : v)}
        >
          <SelectTrigger className="w-40 bg-card">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            <SelectItem value="INBOUND">Inbound</SelectItem>
            <SelectItem value="OUTBOUND">Outbound</SelectItem>
          </SelectContent>
        </Select>
        {can(Permission.MovementsCreate) && (
          <Button onClick={() => setRecording(true)}>
            <Plus className="size-4" /> Record movement
          </Button>
        )}
      </PageHeader>

      <div className="min-h-0 flex-1">
        <DataGrid
          columnDefs={columnDefs}
          rows={list.items}
          loading={list.isLoading}
          meta={list.meta}
          onPageChange={list.setPage}
          onSortChange={list.setSort}
        />
      </div>

      <RecordMovementDialog
        open={recording}
        item={null}
        onOpenChange={setRecording}
        onSaved={() => list.mutate()}
      />
    </div>
  );
}
