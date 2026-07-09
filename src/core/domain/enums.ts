/**
 * Domain-owned enums. The values intentionally match the Prisma enums so the
 * infrastructure layer can map without lookup tables, but the domain never
 * imports generated Prisma code — the dependency points inward only.
 */

export const USER_ROLES = ['ADMIN', 'MANAGER', 'OPERATOR'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const MOVEMENT_TYPES = ['INBOUND', 'OUTBOUND'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];
