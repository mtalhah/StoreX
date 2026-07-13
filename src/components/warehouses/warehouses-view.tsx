'use client';

import type { ColDef, RowClickedEvent } from 'ag-grid-community';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataGrid } from '@/components/data-grid';
import { PageHeader } from '@/components/page-header';
import { RowDetailsDialog } from '@/components/row-details-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Permission } from '@/core/application/auth/permissions';
import { apiFetch, ApiError } from '@/lib/client/api';
import type { WarehouseRow } from '@/lib/client/types';
import { useIsMobile } from '@/lib/client/use-is-mobile';
import { useMe } from '@/lib/client/use-me';
import { usePaginated } from '@/lib/client/use-paginated';
import { formatNumber, formatPercent } from '@/lib/format';
import { WarehouseDialog } from './warehouse-dialog';

export function WarehousesView() {
  const { can } = useMe();
  const canManage = can(Permission.WarehousesManage);
  const isMobile = useIsMobile();
  const list = usePaginated<WarehouseRow>('/api/v1/warehouses', { sortBy: 'name' });

  const [editing, setEditing] = useState<WarehouseRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<WarehouseRow | null>(null);
  const [viewing, setViewing] = useState<WarehouseRow | null>(null);

  const utilizationOf = (row: WarehouseRow) => (row.capacity > 0 ? (row.usedCapacity / row.capacity) * 100 : 0);

  const actionsCol = useMemo<ColDef<WarehouseRow>>(
    () => ({
      colId: 'actions',
      headerName: 'Actions',
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
    }),
    [],
  );

  const columnDefs = useMemo<ColDef<WarehouseRow>[]>(() => {
    if (isMobile) {
      return [
        { field: 'name', headerName: 'Name', minWidth: 130, flex: 1 },
        {
          colId: 'utilization',
          headerName: 'Utilization',
          type: 'rightAligned',
          sortable: false,
          valueGetter: (p) => (p.data ? utilizationOf(p.data) : 0),
          valueFormatter: (p) => formatPercent(p.value ?? 0),
          minWidth: 100,
        },
        ...(canManage ? [actionsCol] : []),
      ];
    }
    return [
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
        valueGetter: (p) => (p.data ? utilizationOf(p.data) : 0),
        valueFormatter: (p) => formatPercent(p.value ?? 0),
      },
      { field: 'skuCount', headerName: 'SKUs', type: 'rightAligned', sortable: false, maxWidth: 100 },
      ...(canManage ? [actionsCol] : []),
    ];
  }, [canManage, isMobile, actionsCol]);

  const handleRowClicked = (event: RowClickedEvent<WarehouseRow>) => {
    if (!isMobile || !event.data) return;
    const target = event.event?.target as HTMLElement | null;
    if (target?.closest('button')) return;
    setViewing(event.data);
  };

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
      <PageHeader title="Warehouses" description="Manage warehouse locations and monitor storage capacity.">
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
          gridOptions={
            isMobile ? { onRowClicked: handleRowClicked, rowStyle: { cursor: 'pointer' } } : undefined
          }
        />
      </div>

      <RowDetailsDialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewing?.name ?? ''}
        fields={
          viewing
            ? [
                { label: 'Name', value: viewing.name },
                { label: 'Location', value: viewing.location },
                { label: 'Capacity', value: formatNumber(viewing.capacity) },
                { label: 'Used capacity', value: formatNumber(viewing.usedCapacity) },
                { label: 'Utilization', value: formatPercent(utilizationOf(viewing)) },
                { label: 'SKUs', value: formatNumber(viewing.skuCount) },
              ]
            : []
        }
      />

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
