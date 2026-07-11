'use client';

import type { ColDef } from 'ag-grid-community';
import { ArrowLeftRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataGrid } from '@/components/data-grid';
import { RecordMovementDialog } from '@/components/movements/record-movement-dialog';
import { PageHeader } from '@/components/page-header';
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
import { useMe } from '@/lib/client/use-me';
import { usePaginated } from '@/lib/client/use-paginated';
import { useWarehouseOptions } from '@/lib/client/use-warehouse-options';
import { formatDateTime, formatDecimal, formatNumber } from '@/lib/format';
import { InventoryItemDialog } from './inventory-item-dialog';

const ALL = 'all';

export function InventoryView() {
  const { can } = useMe();
  const canManage = can(Permission.InventoryManage);
  const canMove = can(Permission.MovementsCreate);
  const { warehouses } = useWarehouseOptions();
  const list = usePaginated<InventoryRow>('/api/v1/inventory', { sortBy: 'sku' });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<InventoryRow | null>(null);
  const [deleting, setDeleting] = useState<InventoryRow | null>(null);
  const [movingItem, setMovingItem] = useState<InventoryRow | null>(null);

  const columnDefs = useMemo<ColDef<InventoryRow>[]>(
    () => [
      { field: 'sku', headerName: 'SKU', minWidth: 130 },
      { field: 'name', headerName: 'Item', minWidth: 220, flex: 2 },
      { field: 'warehouseName', headerName: 'Warehouse', minWidth: 170, sortable: false },
      {
        field: 'quantity',
        headerName: 'On hand',
        type: 'rightAligned',
        valueFormatter: (p) => formatNumber(p.value ?? 0),
        cellClass: (p) => ((p.value ?? 0) === 0 ? 'text-muted-foreground' : ''),
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
        field: 'updatedAt',
        headerName: 'Updated',
        minWidth: 150,
        valueFormatter: (p) => (p.value ? formatDateTime(p.value) : ''),
      },
      {
        colId: 'actions',
        headerName: '',
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
      },
    ],
    [canManage, canMove],
  );

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
    <div className="flex h-full min-h-0 flex-col gap-4 p-6">
      <PageHeader title="Inventory" description="Stock on hand across your warehouses.">
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
        <Input
          placeholder="Search SKU or name…"
          className="w-56 bg-card"
          value={list.state.search}
          onChange={(e) => list.setSearch(e.target.value)}
        />
        {canManage && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New item
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

      <InventoryItemDialog
        open={creating || editing !== null}
        item={editing}
        warehouses={warehouses}
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
