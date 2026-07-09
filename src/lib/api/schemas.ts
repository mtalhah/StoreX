import { z } from 'zod';
import { MOVEMENT_TYPES, USER_ROLES } from '@/core/domain/enums';

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
  sortBy: z.enum(['sku', 'name', 'quantity', 'updatedAt']).default('sku'),
  sortDir: sortDirSchema.default('asc'),
  search: z.string().trim().min(1).max(120).optional(),
  warehouseId: z.string().min(1).optional(),
});

export const inventoryCreateSchema = z.object({
  warehouseId: z.string().min(1),
  sku: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/, 'SKU may contain letters, digits, dots, underscores, and dashes.'),
  name: z.string().trim().min(1).max(200),
});

export const inventoryUpdateSchema = inventoryCreateSchema
  .omit({ warehouseId: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, requireSomeField);

// ---------- stock movements ----------

export const movementListSchema = paginationSchema.extend({
  sortBy: z.enum(['occurredAt', 'quantity', 'type']).default('occurredAt'),
  sortDir: sortDirSchema.default('desc'),
  warehouseId: z.string().min(1).optional(),
  inventoryItemId: z.string().min(1).optional(),
  type: z.enum(MOVEMENT_TYPES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const movementCreateSchema = z.object({
  inventoryItemId: z.string().min(1),
  type: z.enum(MOVEMENT_TYPES),
  quantity: z.number().int().positive().max(1_000_000),
  note: z.string().trim().min(1).max(500).optional(),
});

// ---------- users ----------

export const userListSchema = paginationSchema.extend({
  sortBy: z.enum(['email', 'role', 'createdAt']).default('email'),
  sortDir: sortDirSchema.default('asc'),
  search: z.string().trim().min(1).max(120).optional(),
  role: z.enum(USER_ROLES).optional(),
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

// ---------- analytics ----------

export const trendQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(180).default(30),
});
