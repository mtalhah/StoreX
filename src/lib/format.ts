/** Shared client/server display formatting. */

const numberFmt = new Intl.NumberFormat('en-US');
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

export const STATUS_LABELS: Record<string, string> = {
  LOW_STOCK: 'Low stock',
  DEAD_STOCK: 'Dead stock',
  FAST_MOVER: 'Fast mover',
  HEALTHY: 'Healthy',
};
