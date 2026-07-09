/** Shared read-model and query shapes used across services and ports. */

export interface PageParams {
  page: number;
  pageSize: number;
}

export type SortDir = 'asc' | 'desc';

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export function paginate<T>(items: T[], totalItems: number, params: PageParams): Paginated<T> {
  return {
    items,
    page: params.page,
    pageSize: params.pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / params.pageSize)),
  };
}
