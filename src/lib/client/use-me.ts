'use client';

import useSWR from 'swr';
import type { Permission } from '@/core/application/auth/permissions';
import { swrFetcher, type ApiResult } from './api';

export interface Me {
  userId: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'OPERATOR';
  organizationId: string;
  accessibleWarehouseIds: string[] | null;
  permissions: Permission[];
}

/**
 * Session profile for UI affordances (which buttons/nav to render). Purely
 * cosmetic gating — the API and repositories enforce authorization.
 */
export function useMe() {
  const { data, isLoading } = useSWR<ApiResult<Me>>('/api/v1/me', swrFetcher<Me>, {
    revalidateOnFocus: false,
  });
  const me = data?.data;
  return {
    me,
    isLoading,
    can: (permission: Permission) => me?.permissions.includes(permission) ?? false,
  };
}
