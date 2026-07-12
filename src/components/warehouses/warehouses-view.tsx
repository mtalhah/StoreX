'use client';

import type { ColDef } from 'ag-grid-community';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataGrid } from '@/components/data-grid';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Permission } from '@/core/application/auth/permissions';
import { apiFetch, ApiError } from '@/lib/client/api';
import type { WarehouseRow } from '@/lib/client/types';
import { useMe } from '@/lib/client/use-me';
import { usePaginated } from '@/lib/client/use-paginated';
import { formatNumber, formatPercent } from '@/lib/format';
import { WarehouseDialog } from './warehouse-dialog';

export function WarehousesView() {
  const { can } = useMe();
  const canManage = can(Permission.WarehousesManage);
  const list = usePaginated<WarehouseRow>('/api/v1/warehouses', { sortBy: 'name' });

  const [editing, setEditing] = useState<WarehouseRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<WarehouseRow | null>(null);

  const columnDefs = useMemo<ColDef<WarehouseRow>[]>(
    () => [
      { field: 'name', headerName: 'Name', minWidth: 180, flex: 2 },
      { field: 'location', headerName: 'Location', minWidth: 160, flex: 2 },
      {
        field: 'capacity',
        headerName: 'Capacity',
        headerTooltip: 'Total storage units available.',
        type: 'rightAligned',
        valueFormatter: (p) => formatNumber(p.value ?? 0),
      },
      {
        field: 'usedCapacity',
        headerName: 'Used capacity',
        headerTooltip: 'Storage units consumed: quantity × storage units per item, summed across SKUs.',
        type: 'rightAligned',
        sortable: false,
        valueFormatter: (p) => formatNumber(p.value ?? 0),
      },
      {
        colId: 'utilization',
        headerName: 'Utilization',
        type: 'rightAligned',
        sortable: false,
        valueGetter: (p) =>
          p.data && p.data.capacity > 0 ? (p.data.usedCapacity / p.data.capacity) * 100 : 0,
        valueFormatter: (p) => formatPercent(p.value ?? 0),
      },
      { field: 'skuCount', headerName: 'SKUs', type: 'rightAligned', sortable: false, maxWidth: 100 },
      ...(canManage
        ? [
            {
              colId: 'actions',
              headerName: '',
              sortable: false,
              maxWidth: 110,
              cellRenderer: (p: { data?: WarehouseRow }) =>
                p.data ? (
                  <div className="flex h-full items-center gap-1">
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditing(p.data!)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleting(p.data!)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ) : null,
            } satisfies ColDef<WarehouseRow>,
          ]
        : []),
    ],
    [canManage],
  );

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await apiFetch(`/api/v1/warehouses/${deleting.id}`, { method: 'DELETE' });
      toast.success(`Warehouse "${deleting.name}" deleted.`);
      await list.mutate();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to delete warehouse.');
      throw e;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      <PageHeader title="Warehouses" description="Locations, storage capacity, and current utilization.">
        <Input
          placeholder="Search warehouses…"
          className="w-full bg-card sm:w-56"
          value={list.state.search}
          onChange={(e) => list.setSearch(e.target.value)}
        />
        {canManage && (
          <Button className="w-full sm:w-auto" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New warehouse
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

      <WarehouseDialog
        open={creating || editing !== null}
        warehouse={editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        onSaved={() => list.mutate()}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete warehouse?"
        description={
          deleting
            ? `"${deleting.name}" will be permanently removed. Warehouses with stock on hand cannot be deleted.`
            : ''
        }
        onConfirm={handleDelete}
      />
    </div>
  );
}
