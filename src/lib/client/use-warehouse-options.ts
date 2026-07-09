'use client';

import useSWR from 'swr';
import { swrFetcher, type ApiResult } from './api';
import type { WarehouseRow } from './types';

/** Accessible warehouses for filter/select controls (already tenant-scoped by the API). */
export function useWarehouseOptions() {
  const { data, isLoading } = useSWR<ApiResult<WarehouseRow[]>>(
    '/api/v1/warehouses?page=1&pageSize=100&sortBy=name&sortDir=asc',
    swrFetcher<WarehouseRow[]>,
    { revalidateOnFocus: false },
  );
  return {
    warehouses: (data?.data ?? []).map((w) => ({ id: w.id, name: w.name })),
    isLoading,
  };
}
