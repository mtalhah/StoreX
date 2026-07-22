/** Shared client/server display formatting. */

import type { Permission } from '@/core/application/auth/permissions';

const numberFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatNumber(value: number): string {
  return numberFmt.format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Trims to a few significant decimals without noisy trailing zeros — e.g. 0.001, 4, 0.25. */
export function formatDecimal(value: number, maxFractionDigits = 4): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: maxFractionDigits }).format(value);
}

export function formatDate(value: string | Date): string {
  return dateFmt.format(typeof value === 'string' ? new Date(value) : value);
}

export function formatDateTime(value: string | Date): string {
  return dateTimeFmt.format(typeof value === 'string' ? new Date(value) : value);
}

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Warehouse Manager',
  OPERATOR: 'Operator',
};

export const PERMISSION_LABELS: Record<Permission, { label: string; description: string }> = {
  'users:manage': { label: 'Manage users', description: 'Invite, edit, deactivate, and remove users.' },
  'users:read': { label: 'View users', description: 'See the Users list.' },
  'warehouses:manage': {
    label: 'Manage warehouses',
    description: 'Create, edit, and delete warehouses.',
  },
  'warehouses:read': { label: 'View warehouses', description: 'See warehouse names and locations.' },
  'inventory:manage': {
    label: 'Manage inventory',
    description: 'Create, edit, and delete inventory items.',
  },
  'inventory:read': { label: 'View inventory', description: 'See inventory items and quantities.' },
  'movements:create': { label: 'Record movements', description: 'Log new inbound/outbound movements.' },
  'movements:read': { label: 'View movements', description: 'See the movements ledger.' },
  'movements:manage': {
    label: 'Edit/delete movements',
    description: 'Correct or remove a previously recorded movement.',
  },
  'analytics:read': { label: 'View analytics', description: 'See the dashboard and reports.' },
};

export const STATUS_LABELS: Record<string, string> = {
  LOW_STOCK: 'Low stock',
  DEAD_STOCK: 'Dead stock',
  FAST_MOVER: 'Fast mover',
  HEALTHY: 'Healthy',
};
