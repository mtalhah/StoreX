'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher, type ApiResult } from './api';

export interface PaginatedQueryState {
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  search: string;
  filters: Record<string, string>;
}

/**
 * Server-driven pagination/sorting/filtering state + SWR fetching for the
 * list endpoints. The server is the source of truth for page contents; SWR
 * revalidates on focus and after mutations.
 */
export function usePaginated<T>(
  endpoint: string,
  initial: Partial<PaginatedQueryState> & { sortBy: string },
) {
  const [state, setState] = useState<PaginatedQueryState>({
    page: 1,
    pageSize: 25,
    sortDir: 'asc',
    search: '',
    filters: {},
    ...initial,
  });

  const key = useMemo(() => {
    const params = new URLSearchParams({
      page: String(state.page),
      pageSize: String(state.pageSize),
      sortBy: state.sortBy,
      sortDir: state.sortDir,
    });
    if (state.search.trim()) params.set('search', state.search.trim());
    for (const [k, v] of Object.entries(state.filters)) {
      if (v) params.set(k, v);
    }
    return `${endpoint}?${params.toString()}`;
  }, [endpoint, state]);

  const swr = useSWR<ApiResult<T[]>>(key, swrFetcher<T[]>, { keepPreviousData: true });

  return {
    ...swr,
    items: swr.data?.data ?? [],
    meta: swr.data?.meta,
    state,
    setPage: (page: number) => setState((s) => ({ ...s, page })),
    setSearch: (search: string) => setState((s) => ({ ...s, search, page: 1 })),
    setSort: (sortBy: string, sortDir: 'asc' | 'desc') =>
      setState((s) => ({ ...s, sortBy, sortDir, page: 1 })),
    setFilter: (name: string, value: string) =>
      setState((s) => ({ ...s, filters: { ...s.filters, [name]: value }, page: 1 })),
  };
}
