'use client';

import type { ColDef, RowClickedEvent } from 'ag-grid-community';
import { Filter, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataGrid } from '@/components/data-grid';
import { PageHeader } from '@/components/page-header';
import { RowDetailsDialog } from '@/components/row-details-dialog';
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
import { Permission } from '@/core/application/auth/permissions';
import { apiFetch, ApiError } from '@/lib/client/api';
import type { UserRow } from '@/lib/client/types';
import { useIsMobile } from '@/lib/client/use-is-mobile';
import { useMe } from '@/lib/client/use-me';
import { usePaginated } from '@/lib/client/use-paginated';
import { useWarehouseOptions } from '@/lib/client/use-warehouse-options';
import { ROLE_LABELS } from '@/lib/format';
import { UserDialog } from './user-dialog';

const ALL = 'all';

const STATUS_FILTER_LABELS: Record<string, string> = {
  all: 'All statuses',
  ACTIVE: 'Active',
  DEACTIVATED: 'Deactivated',
  INVITED: 'Invited',
  INVITE_NOT_SENT: 'Invite not sent',
};

interface UserFilters {
  role: string;
  warehouseId: string;
  status: string;
}

const EMPTY_FILTERS: UserFilters = { role: '', warehouseId: '', status: '' };

function StatusBadge({ user }: { user: UserRow }) {
  if (!user.isActive) {
    return (
      <Badge variant="outline" className="border-zinc-200 bg-zinc-500/10 text-zinc-500">
        Deactivated
      </Badge>
    );
  }
  if (user.workosUserId) {
    return (
      <Badge variant="outline" className="border-emerald-200 bg-emerald-500/10 text-emerald-600">
        Active
      </Badge>
    );
  }
  if (user.invitationStatus === 'SKIPPED') {
    return (
      <Badge variant="outline" className="border-amber-200 bg-amber-500/10 text-amber-600">
        Invite not sent
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-blue-200 bg-blue-500/10 text-blue-600">
      Invited
    </Badge>
  );
}

function warehousesOf(user: UserRow): string {
  return user.role === 'ADMIN' ? 'All (organization-wide)' : user.warehouses.map((w) => w.name).join(', ');
}

export function UsersView({ currentUserId }: { currentUserId: string }) {
  const { can } = useMe();
  const canManage = can(Permission.UsersManage);
  const isMobile = useIsMobile();
  const { warehouses } = useWarehouseOptions();
  const list = usePaginated<UserRow>('/api/v1/users', { sortBy: 'email' });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [viewing, setViewing] = useState<UserRow | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pending, setPending] = useState<UserFilters>(EMPTY_FILTERS);

  const activeFilterCount = Object.values(list.state.filters).filter(Boolean).length;

  const openFilters = (open: boolean) => {
    if (open) {
      setPending({
        role: list.state.filters.role ?? '',
        warehouseId: list.state.filters.warehouseId ?? '',
        status: list.state.filters.status ?? '',
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

  const actionsCol = useMemo<ColDef<UserRow>>(
    () => ({
      colId: 'actions',
      headerName: 'Actions',
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
    }),
    [currentUserId],
  );

  const columnDefs = useMemo<ColDef<UserRow>[]>(() => {
    if (isMobile) {
      return [
        {
          colId: 'name',
          headerName: 'Name',
          minWidth: 110,
          flex: 1,
          sortable: false,
          valueGetter: (p) => [p.data?.firstName, p.data?.lastName].filter(Boolean).join(' ') || '—',
        },
        {
          field: 'role',
          headerName: 'Role',
          minWidth: 90,
          valueFormatter: (p) => ROLE_LABELS[p.value] ?? p.value,
        },
        {
          colId: 'warehouses',
          headerName: 'Warehouse',
          minWidth: 110,
          flex: 1,
          sortable: false,
          valueGetter: (p) => (p.data ? warehousesOf(p.data) : ''),
        },
        ...(canManage ? [actionsCol] : []),
      ];
    }
    return [
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
        valueGetter: (p) => (p.data ? warehousesOf(p.data) : ''),
      },
      {
        colId: 'status',
        headerName: 'Status',
        maxWidth: 130,
        sortable: false,
        cellRenderer: (p: { data?: UserRow }) => (p.data ? <StatusBadge user={p.data} /> : null),
      },
      ...(canManage ? [actionsCol] : []),
    ];
  }, [canManage, isMobile, actionsCol]);

  const handleRowClicked = (event: RowClickedEvent<UserRow>) => {
    if (!isMobile || !event.data) return;
    const target = event.event?.target as HTMLElement | null;
    if (target?.closest('button')) return;
    setViewing(event.data);
  };

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
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Users"
        description="Provision teammates and control their warehouse access."
      >
        <Input
          placeholder="Search users…"
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
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  value={pending.role || ALL}
                  onValueChange={(v) => setPending((p) => ({ ...p, role: !v || v === ALL ? '' : v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v: string) => (v === ALL ? 'All roles' : ROLE_LABELS[v] ?? v)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All roles</SelectItem>
                    {(['ADMIN', 'MANAGER', 'OPERATOR'] as const).map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
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
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={pending.status || ALL}
                  onValueChange={(v) => setPending((p) => ({ ...p, status: !v || v === ALL ? '' : v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v: string) => STATUS_FILTER_LABELS[v] ?? 'All statuses'}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All statuses</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="DEACTIVATED">Deactivated</SelectItem>
                    <SelectItem value="INVITED">Invited</SelectItem>
                    <SelectItem value="INVITE_NOT_SENT">Invite not sent</SelectItem>
                  </SelectContent>
                </Select>
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
        {canManage && (
          <Button className="w-full sm:w-auto" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Invite user
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
        title={viewing?.email ?? ''}
        fields={
          viewing
            ? [
                { label: 'Email', value: viewing.email },
                {
                  label: 'Name',
                  value: [viewing.firstName, viewing.lastName].filter(Boolean).join(' ') || '—',
                },
                { label: 'Role', value: ROLE_LABELS[viewing.role] ?? viewing.role },
                { label: 'Warehouses', value: warehousesOf(viewing) || '—' },
                { label: 'Status', value: <StatusBadge user={viewing} /> },
              ]
            : []
        }
      />

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
