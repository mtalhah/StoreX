import { z } from 'zod';
import { MOVEMENT_TYPES, USER_ROLES } from '@/core/domain/enums';
import { USER_STATUS_FILTERS } from '@/core/application/ports/user-repository';
import { Permission } from '@/core/application/auth/permissions';

/** Zod schemas for query strings and request bodies (API boundary only). */

// ---------- shared ----------

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const sortDirSchema = z.enum(['asc', 'desc']);

const requireSomeField = { error: 'At least one field must be provided.' };

export function parseQuery<S extends z.ZodType>(schema: S, url: URL): z.output<S> {
  return schema.parse(Object.fromEntries(url.searchParams));
}

// ---------- warehouses ----------

export const warehouseListSchema = paginationSchema.extend({
  sortBy: z.enum(['name', 'location', 'capacity', 'createdAt']).default('name'),
  sortDir: sortDirSchema.default('asc'),
  search: z.string().trim().min(1).max(120).optional(),
});

export const warehouseCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  location: z.string().trim().min(1).max(200),
  capacity: z.number().int().positive().max(100_000_000),
});

export const warehouseUpdateSchema = warehouseCreateSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, requireSomeField);

// ---------- inventory ----------

export const inventoryListSchema = paginationSchema.extend({
  sortBy: z.enum(['sku', 'name', 'quantity', 'storageUnitsPerItem', 'updatedAt']).default('sku'),
  sortDir: sortDirSchema.default('asc'),
  search: z.string().trim().min(1).max(120).optional(),
  warehouseId: z.string().min(1).optional(),
});

const skuField = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, 'SKU may contain letters, digits, dots, underscores, and dashes.');
const nameField = z.string().trim().min(1).max(200);

/**
 * Dual input mode for the storage-capacity ratio (see
 * StockMovementService's capacity math): the UI/API accept either the
 * canonical `storageUnitsPerItem` or its inverse, `itemsPerStorageUnit`, but
 * never both at once. `resolveStorageUnitsPerItem` below converts whichever
 * was given into the canonical value before it reaches services/repositories.
 */
const storageRatioFields = {
  storageUnitsPerItem: z.number().positive().max(1_000_000).optional(),
  itemsPerStorageUnit: z.number().positive().max(1_000_000).optional(),
};
const exclusiveStorageRatio = {
  error: 'Provide either storageUnitsPerItem or itemsPerStorageUnit, not both.',
  path: ['storageUnitsPerItem'],
};
function hasExclusiveStorageRatio(v: {
  storageUnitsPerItem?: number;
  itemsPerStorageUnit?: number;
}): boolean {
  return !(v.storageUnitsPerItem !== undefined && v.itemsPerStorageUnit !== undefined);
}

/** Converts whichever input mode was provided into the canonical stored value. */
export function resolveStorageUnitsPerItem(input: {
  storageUnitsPerItem?: number;
  itemsPerStorageUnit?: number;
}): number | undefined {
  if (input.storageUnitsPerItem !== undefined) return input.storageUnitsPerItem;
  if (input.itemsPerStorageUnit !== undefined) return 1 / input.itemsPerStorageUnit;
  return undefined;
}

export const inventoryCreateSchema = z
  .object({
    warehouseId: z.string().min(1),
    sku: skuField,
    name: nameField,
    ...storageRatioFields,
  })
  .refine(hasExclusiveStorageRatio, exclusiveStorageRatio);

export const inventoryUpdateSchema = z
  .object({
    sku: skuField.optional(),
    name: nameField.optional(),
    ...storageRatioFields,
  })
  .refine(hasExclusiveStorageRatio, exclusiveStorageRatio)
  .refine((v) => Object.keys(v).length > 0, requireSomeField);

// ---------- stock movements ----------

export const movementListSchema = paginationSchema.extend({
  sortBy: z.enum(['occurredAt', 'quantity', 'type']).default('occurredAt'),
  sortDir: sortDirSchema.default('desc'),
  search: z.string().trim().min(1).max(120).optional(),
  warehouseId: z.string().min(1).optional(),
  inventoryItemId: z.string().min(1).optional(),
  type: z.enum(MOVEMENT_TYPES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  quantityMin: z.coerce.number().int().min(0).optional(),
  quantityMax: z.coerce.number().int().min(0).optional(),
  recordedBy: z.string().trim().min(1).max(120).optional(),
});

export const movementCreateSchema = z.object({
  inventoryItemId: z.string().min(1),
  type: z.enum(MOVEMENT_TYPES),
  quantity: z.number().int().positive().max(1_000_000),
  note: z.string().trim().min(1).max(500).optional(),
});

export const movementUpdateSchema = z
  .object({
    quantity: z.number().int().positive().max(1_000_000).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, requireSomeField);

// ---------- users ----------

export const userListSchema = paginationSchema.extend({
  sortBy: z.enum(['email', 'role', 'createdAt']).default('email'),
  sortDir: sortDirSchema.default('asc'),
  search: z.string().trim().min(1).max(120).optional(),
  role: z.enum(USER_ROLES).optional(),
  warehouseId: z.string().min(1).optional(),
  status: z.enum(USER_STATUS_FILTERS).optional(),
});

export const userCreateSchema = z.object({
  email: z.email().max(254),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  role: z.enum(USER_ROLES),
  warehouseIds: z.array(z.string().min(1)).max(50).default([]),
});

export const userUpdateSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    role: z.enum(USER_ROLES).optional(),
    warehouseIds: z.array(z.string().min(1)).max(50).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, requireSomeField);

// ---------- permissions ----------

const permissionValueSchema = z.enum(Object.values(Permission) as [Permission, ...Permission[]]);
/** MANAGER/OPERATOR only — ADMIN's permissions are fixed (see permissions.ts). */
const editableRoleSchema = z.enum(['MANAGER', 'OPERATOR']);

export const roleParamSchema = z.object({ role: editableRoleSchema });

export const rolePermissionsUpdateSchema = z.object({
  permissions: z.array(permissionValueSchema).max(Object.values(Permission).length),
});

export const userPermissionOverridesUpdateSchema = z.object({
  overrides: z
    .array(
      z.object({
        permission: permissionValueSchema,
        effect: z.enum(['GRANT', 'REVOKE']),
      }),
    )
    .max(Object.values(Permission).length),
});

// ---------- analytics ----------

const STOCK_STATUSES = ['LOW_STOCK', 'DEAD_STOCK', 'FAST_MOVER', 'HEALTHY'] as const;

export const periodQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(180).default(30),
});

export const insightsQuerySchema = periodQuerySchema.extend({
  warehouseId: z.string().min(1).optional(),
  status: z.enum(STOCK_STATUSES).optional(),
  lastMovementFrom: z.string().trim().min(1).optional(),
  lastMovementTo: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(5),
});
