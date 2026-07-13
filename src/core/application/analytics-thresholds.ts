/**
 * Operational-insight thresholds, shared by every AnalyticsRepository
 * implementation (they are injected into the SQL as query parameters, so
 * BigQuery and the Postgres dev fallback classify identically).
 */
export const ANALYTICS_THRESHOLDS = {
  /** At or below this quantity an item is flagged LOW_STOCK. */
  lowStockQty: 25,
  /** No movement for this many days flags DEAD_STOCK — independent of the flow period selector. */
  deadStockDays: 30,
  /**
   * Outbound rate (units/day) at/above this flags FAST_MOVER. Expressed as a
   * rate rather than a fixed-window count so classification stays meaningful
   * regardless of the selected trailing period — compare against
   * outboundInPeriod / periodDays, not outboundInPeriod directly. Derived
   * from the original 400-units-per-30-days threshold.
   */
  fastMoverOutboundPerDay: 400 / 30,
} as const;
