'use client';

import type { ColDef, RowClickedEvent } from 'ag-grid-community';
import { ArrowLeftRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataGrid } from '@/components/data-grid';
import { RecordMovementDialog } from '@/components/movements/record-movement-dialog';
import { PageHeader } from '@/components/page-header';
import { RowDetailsDialog } from '@/components/row-details-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Permission } from '@/core/application/auth/permissions';
import { apiFetch, ApiError } from '@/lib/client/api';
import type { InventoryRow } from '@/lib/client/types';
import { useIsMobile } from '@/lib/client/use-is-mobile';
import { useMe } from '@/lib/client/use-me';
import { usePaginated } from '@/lib/client/use-paginated';
import { useWarehouseOptions } from '@/lib/client/use-warehouse-options';
import { formatDateTime, formatDecimal, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { InventoryItemDialog } from './inventory-item-dialog';

const ALL = 'all';

export function InventoryView() {
  const { me, can } = useMe();
  const canManage = can(Permission.InventoryManage);
  const canMove = can(Permission.MovementsCreate);
  const isOperator = me?.role === 'OPERATOR';
  const isMobile = useIsMobile();
  const { warehouses } = useWarehouseOptions();
  const list = usePaginated<InventoryRow>('/api/v1/inventory', { sortBy: 'sku' });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<InventoryRow | null>(null);
  const [deleting, setDeleting] = useState<InventoryRow | null>(null);
  const [movingItem, setMovingItem] = useState<InventoryRow | null>(null);
  const [viewing, setViewing] = useState<InventoryRow | null>(null);

  const actionsCol = useMemo<ColDef<InventoryRow>>(
    () => ({
      colId: 'actions',
      headerName: 'Actions',
      sortable: false,
      maxWidth: 140,
      cellRenderer: (p: { data?: InventoryRow }) =>
        p.data ? (
          <div className="flex h-full items-center gap-1">
            {canMove && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-primary hover:text-primary"
                title="Record movement"
                onClick={() => setMovingItem(p.data!)}
              >
                <ArrowLeftRight className="size-3.5" />
              </Button>
            )}
            {canManage && (
              <>
                <Button variant="ghost" size="icon" className="size-7" title="Edit" onClick={() => setEditing(p.data!)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-destructive hover:text-destructive"
                  title="Delete"
                  onClick={() => setDeleting(p.data!)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </>
            )}
          </div>
        ) : null,
    }),
    [canManage, canMove],
  );

  const showActions = canManage || canMove;

  const columnDefs = useMemo<ColDef<InventoryRow>[]>(() => {
    if (isMobile) {
      return [
        { field: 'sku', headerName: 'SKU', minWidth: 110, flex: 1 },
        { field: 'name', headerName: 'Item', minWidth: 110, flex: 1 },
        {
          field: 'quantity',
          headerName: 'Qty',
          type: 'rightAligned',
          valueFormatter: (p) => formatNumber(p.value ?? 0),
          cellClass: (p) => cn('ag-right-aligned-cell', (p.value ?? 0) === 0 && 'text-muted-foreground'),
          maxWidth: 90,
        },
        ...(showActions ? [actionsCol] : []),
      ];
    }
    return [
      { field: 'sku', headerName: 'SKU', minWidth: 130 },
      { field: 'name', headerName: 'Item', minWidth: 220, flex: 2 },
      { field: 'warehouseName', headerName: 'Warehouse', minWidth: 170, sortable: false },
      {
        field: 'quantity',
        headerName: 'Qty',
        type: 'rightAligned',
        valueFormatter: (p) => formatNumber(p.value ?? 0),
        cellClass: (p) => cn('ag-right-aligned-cell', (p.value ?? 0) === 0 && 'text-muted-foreground'),
        maxWidth: 130,
      },
      {
        field: 'storageUnitsPerItem',
        headerName: 'Storage units / item',
        headerTooltip: 'Canonical ratio used to compute how much warehouse capacity this SKU consumes.',
        type: 'rightAligned',
        valueFormatter: (p) => formatDecimal(p.value ?? 1),
        maxWidth: 150,
      },
      {
        colId: 'totalStorageUnits',
        headerName: 'Total storage',
        headerTooltip: 'Warehouse storage units consumed by this SKU: quantity × storage units / item.',
        type: 'rightAligned',
        sortable: false,
        valueGetter: (p) => (p.data ? p.data.quantity * (p.data.storageUnitsPerItem ?? 1) : 0),
        valueFormatter: (p) => formatDecimal(p.value ?? 0),
        maxWidth: 140,
      },
      {
        field: 'updatedAt',
        headerName: 'Updated',
        minWidth: 150,
        valueFormatter: (p) => (p.value ? formatDateTime(p.value) : ''),
      },
      ...(showActions ? [actionsCol] : []),
    ];
  }, [isMobile, actionsCol, showActions]);

  const handleRowClicked = (event: RowClickedEvent<InventoryRow>) => {
    if (!isMobile || !event.data) return;
    const target = event.event?.target as HTMLElement | null;
    if (target?.closest('button')) return;
    setViewing(event.data);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await apiFetch(`/api/v1/inventory/${deleting.id}`, { method: 'DELETE' });
      toast.success(`${deleting.sku} deleted.`);
      await list.mutate();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to delete item.');
      throw e;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      <PageHeader title="Inventory" description="Track and manage stock levels across every warehouse.">
        <Select
          value={list.state.filters.warehouseId || ALL}
          onValueChange={(v) => list.setFilter('warehouseId', !v || v === ALL ? '' : v)}
        >
          <SelectTrigger className="w-full bg-card sm:w-52">
            <SelectValue placeholder="All warehouses">
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
        <Input
          placeholder="Search SKU or name…"
          className="w-full bg-card sm:w-56"
          value={list.state.search}
          onChange={(e) => list.setSearch(e.target.value)}
        />
        {canManage && (
          <Button className="w-full sm:w-auto" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New item
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
          pageSizeOptions={[10, 20, 50, 100]}
          onPageSizeChange={list.setPageSize}
          onSortChange={list.setSort}
          gridOptions={
            isMobile ? { onRowClicked: handleRowClicked, rowStyle: { cursor: 'pointer' } } : undefined
          }
        />
      </div>

      <RowDetailsDialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewing?.sku ?? ''}
        fields={
          viewing
            ? [
                { label: 'SKU', value: viewing.sku },
                { label: 'Item', value: viewing.name },
                { label: 'Warehouse', value: viewing.warehouseName },
                { label: 'Qty', value: formatNumber(viewing.quantity) },
                { label: 'Storage units / item', value: formatDecimal(viewing.storageUnitsPerItem ?? 1) },
                {
                  label: 'Total storage',
                  value: formatDecimal(viewing.quantity * (viewing.storageUnitsPerItem ?? 1)),
                },
                { label: 'Updated', value: viewing.updatedAt ? formatDateTime(viewing.updatedAt) : '' },
              ]
            : []
        }
      />

      <InventoryItemDialog
        open={creating || editing !== null}
        item={editing}
        warehouses={warehouses}
        isOperator={isOperator}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        onSaved={() => list.mutate()}
      />
      <RecordMovementDialog
        open={movingItem !== null}
        item={movingItem}
        onOpenChange={(open) => !open && setMovingItem(null)}
        onSaved={() => list.mutate()}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete inventory item?"
        description={
          deleting
            ? `${deleting.sku} — ${deleting.name} will be removed. Items with stock on hand cannot be deleted.`
            : ''
        }
        onConfirm={handleDelete}
      />
    </div>
  );
}
