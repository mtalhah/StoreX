'use client';

import type { ColDef } from 'ag-grid-community';
import { Filter, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { PageHeader } from '@/components/page-header';
import { Permission } from '@/core/application/auth/permissions';
import type { MovementRow } from '@/lib/client/types';
import { useMe } from '@/lib/client/use-me';
import { usePaginated } from '@/lib/client/use-paginated';
import { useWarehouseOptions } from '@/lib/client/use-warehouse-options';
import { formatDateTime, formatNumber } from '@/lib/format';
import { RecordMovementDialog } from './record-movement-dialog';

const ALL = 'all';

const TYPE_LABELS: Record<string, string> = {
  all: 'All types',
  INBOUND: 'Inbound',
  OUTBOUND: 'Outbound',
};

interface MovementFilters {
  type: string;
  warehouseId: string;
  from: string;
  to: string;
  quantityMin: string;
  quantityMax: string;
  recordedBy: string;
}

const EMPTY_FILTERS: MovementFilters = {
  type: '',
  warehouseId: '',
  from: '',
  to: '',
  quantityMin: '',
  quantityMax: '',
  recordedBy: '',
};

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pending, setPending] = useState<MovementFilters>(EMPTY_FILTERS);

  const activeFilterCount = Object.values(list.state.filters).filter(Boolean).length;

  const openFilters = (open: boolean) => {
    if (open) {
      setPending({
        type: list.state.filters.type ?? '',
        warehouseId: list.state.filters.warehouseId ?? '',
        from: list.state.filters.from ?? '',
        to: list.state.filters.to ?? '',
        quantityMin: list.state.filters.quantityMin ?? '',
        quantityMax: list.state.filters.quantityMax ?? '',
        recordedBy: list.state.filters.recordedBy ?? '',
      });
    }
    setFiltersOpen(open);
  };

  const applyFilters = () => {
    for (const [key, value] of Object.entries(pending)) {
      list.setFilter(key, value);
    }
    setFiltersOpen(false);
  };

  const clearFilters = () => {
    setPending(EMPTY_FILTERS);
    for (const key of Object.keys(EMPTY_FILTERS)) {
      list.setFilter(key, '');
    }
    setFiltersOpen(false);
  };

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
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      <PageHeader title="Stock movements" description="The immutable ledger behind every quantity.">
        <Input
          placeholder="Search SKU or item…"
          className="w-full bg-card sm:w-56"
          value={list.state.search}
          onChange={(e) => list.setSearch(e.target.value)}
        />
        <Popover open={filtersOpen} onOpenChange={openFilters}>
          <PopoverTrigger render={<Button variant="outline" className="w-full gap-1.5 bg-card sm:w-auto" />}>
            <Filter className="size-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent className="w-80 max-w-[calc(100vw-2rem)]" align="start">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="mf-from">From</Label>
                  <Input
                    id="mf-from"
                    type="date"
                    value={pending.from}
                    onChange={(e) => setPending((p) => ({ ...p, from: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mf-to">To</Label>
                  <Input
                    id="mf-to"
                    type="date"
                    value={pending.to}
                    onChange={(e) => setPending((p) => ({ ...p, to: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={pending.type || ALL}
                  onValueChange={(v) => setPending((p) => ({ ...p, type: !v || v === ALL ? '' : v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v: string) => TYPE_LABELS[v] ?? 'All types'}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All types</SelectItem>
                    <SelectItem value="INBOUND">Inbound</SelectItem>
                    <SelectItem value="OUTBOUND">Outbound</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                        v === ALL ? 'All warehouses' : (warehouses.find((w) => w.id === v)?.name ?? 'All warehouses')
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
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="mf-qty-min">Qty min</Label>
                  <Input
                    id="mf-qty-min"
                    type="number"
                    min={0}
                    value={pending.quantityMin}
                    onChange={(e) => setPending((p) => ({ ...p, quantityMin: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mf-qty-max">Qty max</Label>
                  <Input
                    id="mf-qty-max"
                    type="number"
                    min={0}
                    value={pending.quantityMax}
                    onChange={(e) => setPending((p) => ({ ...p, quantityMax: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mf-recorded-by">Recorded by</Label>
                <Input
                  id="mf-recorded-by"
                  placeholder="Name or email…"
                  value={pending.recordedBy}
                  onChange={(e) => setPending((p) => ({ ...p, recordedBy: e.target.value }))}
                />
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
        {can(Permission.MovementsCreate) && (
          <Button className="w-full sm:w-auto" onClick={() => setRecording(true)}>
            <Plus className="size-4" /> Record movement
          </Button>
        )}
      </PageHeader>

      <div className="min-h-0 min-w-0 flex-1">
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
