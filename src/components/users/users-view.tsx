'use client';

import type { ColDef } from 'ag-grid-community';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataGrid } from '@/components/data-grid';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch, ApiError } from '@/lib/client/api';
import type { UserRow } from '@/lib/client/types';
import { usePaginated } from '@/lib/client/use-paginated';
import { useWarehouseOptions } from '@/lib/client/use-warehouse-options';
import { ROLE_LABELS } from '@/lib/format';
import { UserDialog } from './user-dialog';

export function UsersView({ currentUserId }: { currentUserId: string }) {
  const { warehouses } = useWarehouseOptions();
  const list = usePaginated<UserRow>('/api/v1/users', { sortBy: 'email' });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);

  const columnDefs = useMemo<ColDef<UserRow>[]>(
    () => [
      { field: 'email', headerName: 'Email', minWidth: 220, flex: 2 },
      {
        colId: 'name',
        headerName: 'Name',
        minWidth: 150,
        sortable: false,
        valueGetter: (p) =>
          [p.data?.firstName, p.data?.lastName].filter(Boolean).join(' ') || '—',
      },
      {
        field: 'role',
        headerName: 'Role',
        minWidth: 160,
        valueFormatter: (p) => ROLE_LABELS[p.value] ?? p.value,
      },
      {
        colId: 'warehouses',
        headerName: 'Warehouses',
        minWidth: 200,
        flex: 2,
        sortable: false,
        valueGetter: (p) =>
          p.data?.role === 'ADMIN'
            ? 'All (organization-wide)'
            : (p.data?.warehouses.map((w) => w.name).join(', ') ?? ''),
      },
      {
        colId: 'status',
        headerName: 'Status',
        maxWidth: 130,
        sortable: false,
        cellRenderer: (p: { data?: UserRow }) =>
          p.data ? (
            p.data.isActive ? (
              p.data.workosUserId ? (
                <Badge variant="outline" className="border-emerald-200 bg-emerald-500/10 text-emerald-600">
                  Active
                </Badge>
              ) : (
                <Badge variant="outline" className="border-blue-200 bg-blue-500/10 text-blue-600">
                  Invited
                </Badge>
              )
            ) : (
              <Badge variant="outline" className="border-zinc-200 bg-zinc-500/10 text-zinc-500">
                Deactivated
              </Badge>
            )
          ) : null,
      },
      {
        colId: 'actions',
        headerName: '',
        sortable: false,
        maxWidth: 110,
        cellRenderer: (p: { data?: UserRow }) =>
          p.data ? (
            <div className="flex h-full items-center gap-1">
              <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditing(p.data!)}>
                <Pencil className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-destructive hover:text-destructive disabled:opacity-30"
                disabled={p.data.id === currentUserId}
                title={p.data.id === currentUserId ? 'You cannot remove yourself' : 'Delete'}
                onClick={() => setDeleting(p.data!)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ) : null,
      },
    ],
    [currentUserId],
  );

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await apiFetch(`/api/v1/users/${deleting.id}`, { method: 'DELETE' });
      toast.success(`${deleting.email} removed.`);
      await list.mutate();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to remove user.');
      throw e;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-6">
      <PageHeader
        title="Users"
        description="Provision teammates and control their warehouse access."
      >
        <Input
          placeholder="Search users…"
          className="w-56 bg-card"
          value={list.state.search}
          onChange={(e) => list.setSearch(e.target.value)}
        />
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" /> Invite user
        </Button>
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

      <UserDialog
        open={creating || editing !== null}
        user={editing}
        warehouses={warehouses}
        isSelf={editing?.id === currentUserId}
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
        title="Remove user?"
        description={
          deleting
            ? `${deleting.email} will lose access. Users who have recorded movements can only be deactivated.`
            : ''
        }
        confirmLabel="Remove"
        onConfirm={handleDelete}
      />
    </div>
  );
}
