import { ValidationError } from '@/core/domain/errors';
import { authorize, Permission } from '../auth/permissions';
import type { TenantContext } from '../auth/tenant-context';
import type { PageParams, Paginated } from '../dto/common';
import type {
  AnalyticsRepository,
  DashboardKpis,
  InventoryInsightFilters,
  InventoryInsightRow,
  MovementTrendPoint,
  WarehouseUtilizationRow,
} from '../ports/analytics-repository';

const MAX_PERIOD_DAYS = 180;

function assertValidPeriod(days: number): void {
  if (!Number.isInteger(days) || days < 1 || days > MAX_PERIOD_DAYS) {
    throw new ValidationError(`Period must be between 1 and ${MAX_PERIOD_DAYS} days.`);
  }
}

export class AnalyticsService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly analytics: AnalyticsRepository,
  ) {}

  async kpis(days: number): Promise<DashboardKpis> {
    authorize(this.ctx, Permission.AnalyticsRead);
    assertValidPeriod(days);
    return this.analytics.getKpis(days);
  }

  async movementTrend(days: number): Promise<MovementTrendPoint[]> {
    authorize(this.ctx, Permission.AnalyticsRead);
    assertValidPeriod(days);
    return this.analytics.getMovementTrend(days);
  }

  async warehouseUtilization(): Promise<WarehouseUtilizationRow[]> {
    authorize(this.ctx, Permission.AnalyticsRead);
    return this.analytics.getWarehouseUtilization();
  }

  async inventoryInsights(
    days: number,
    filters: InventoryInsightFilters | undefined,
    page: PageParams,
  ): Promise<Paginated<InventoryInsightRow>> {
    authorize(this.ctx, Permission.AnalyticsRead);
    assertValidPeriod(days);
    return this.analytics.getInventoryInsights(days, filters, page);
  }
}
