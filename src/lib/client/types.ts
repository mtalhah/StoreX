/**
 * Client-side row shapes: the JSON forms of the server DTOs (Dates arrive as
 * ISO strings over the wire).
 */
import type { InvitationStatus, MovementType, UserRole } from '@/core/domain/enums';

export interface WarehouseRow {
  id: string;
  name: string;
  location: string;
  capacity: number;
  totalQuantity: number;
  /** Storage units consumed: sum(quantity * storageUnitsPerItem). Compared against `capacity`. */
  usedCapacity: number;
  skuCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryRow {
  id: string;
  warehouseId: string;
  warehouseName: string;
  sku: string;
  name: string;
  quantity: number;
  /** Canonical storage-unit-per-item ratio (see Warehouse.capacity). */
  storageUnitsPerItem: number;
  createdAt: string;
  updatedAt: string;
}

export interface MovementRow {
  id: string;
  warehouseId: string;
  warehouseName: string;
  inventoryItemId: string;
  sku: string;
  itemName: string;
  type: MovementType;
  quantity: number;
  note: string | null;
  createdByName: string;
  occurredAt: string;
}

export interface UserRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  isActive: boolean;
  workosUserId: string | null;
  invitationStatus: InvitationStatus | null;
  warehouses: Array<{ id: string; name: string }>;
  createdAt: string;
}
