'use client';

import type { PaginationMeta } from '@/lib/api/response';

/** Typed client for the envelope-based REST API. */

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiResult<T> {
  data: T;
  meta?: PaginationMeta;
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (res.status === 204) {
    return { data: undefined as T };
  }

  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const error = body?.error;
    throw new ApiError(
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? `Request failed with status ${res.status}`,
      res.status,
      error?.details,
    );
  }
  return { data: body.data as T, meta: body.meta };
}

/** SWR fetcher returning the full { data, meta } result. */
export const swrFetcher = <T>(url: string): Promise<ApiResult<T>> => apiFetch<T>(url);
