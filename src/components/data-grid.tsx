'use client';

import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type GridOptions,
  type SortChangedEvent,
} from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PaginationMeta } from '@/lib/api/response';
import { formatNumber } from '@/lib/format';

ModuleRegistry.registerModules([AllCommunityModule]);

/** Storex AG Grid theme — matches the shadcn/iOS-blue design tokens. */
const storexTheme = themeQuartz.withParams({
  accentColor: '#007aff',
  borderColor: '#e8e9ed',
  headerBackgroundColor: '#f8f9fb',
  headerTextColor: '#5b616e',
  fontFamily: 'inherit',
  fontSize: 13,
  headerFontSize: 12,
  rowHoverColor: '#f4f7ff',
  wrapperBorderRadius: 12,
  cellHorizontalPadding: 14,
});

export interface DataGridProps<T> {
  columnDefs: ColDef<T>[];
  rows: T[];
  loading?: boolean;
  /** Server-side pagination footer; omit for client-only grids. */
  meta?: PaginationMeta;
  onPageChange?: (page: number) => void;
  /** Server-side sorting: single-column sort forwarded to the API. */
  onSortChange?: (sortBy: string, sortDir: 'asc' | 'desc') => void;
  gridOptions?: GridOptions<T>;
}

const defaultColDef: ColDef = {
  flex: 1,
  minWidth: 110,
  resizable: true,
  sortable: true,
  suppressHeaderMenuButton: true,
};

/**
 * Thin wrapper around AG Grid: consistent theme, internal scrolling (the grid
 * fills whatever height its parent gives it), and an optional server-driven
 * pagination footer.
 */
export function DataGrid<T>({
  columnDefs,
  rows,
  loading,
  meta,
  onPageChange,
  onSortChange,
  gridOptions,
}: DataGridProps<T>) {
  const handleSortChanged = (event: SortChangedEvent<T>) => {
    if (!onSortChange) return;
    const sorted = event.api
      .getColumnState()
      .find((c) => c.sort !== null && c.sort !== undefined);
    if (sorted?.colId && sorted.sort) onSortChange(sorted.colId, sorted.sort);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="min-h-0 flex-1">
        <AgGridReact<T>
          theme={storexTheme}
          columnDefs={columnDefs}
          rowData={rows}
          loading={loading}
          defaultColDef={defaultColDef}
          animateRows
          suppressCellFocus
          onSortChanged={onSortChange ? handleSortChanged : undefined}
          {...gridOptions}
        />
      </div>
      {meta && onPageChange && (
        <div className="flex items-center justify-between px-1 text-sm text-muted-foreground">
          <span>
            {formatNumber(meta.totalItems)} {meta.totalItems === 1 ? 'record' : 'records'}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              disabled={meta.page <= 1 || loading}
              onClick={() => onPageChange(meta.page - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="tabular-nums">
              Page {meta.page} of {meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              disabled={meta.page >= meta.totalPages || loading}
              onClick={() => onPageChange(meta.page + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
