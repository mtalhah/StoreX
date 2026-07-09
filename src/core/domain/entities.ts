import type { MovementType, UserRole } from './enums';

/** Core domain entities — plain data shapes, no persistence concerns. */

export interface Organization {
  id: string;
  name: string;
  workosOrgId: string | null;
  createdAt: Date;
}

export interface User {
  id: string;
  workosUserId: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  organizationId: string;
  isActive: boolean;
  createdAt: Date;
}

export interface Warehouse {
  id: string;
  organizationId: string;
  name: string;
  location: string;
  capacity: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryItem {
  id: string;
  organizationId: string;
  warehouseId: string;
  sku: string;
  name: string;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockMovement {
  id: string;
  organizationId: string;
  warehouseId: string;
  inventoryItemId: string;
  type: MovementType;
  quantity: number;
  note: string | null;
  createdById: string;
  occurredAt: Date;
}
