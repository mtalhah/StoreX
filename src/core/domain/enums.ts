/**
 * Domain-owned enums. The values intentionally match the Prisma enums so the
 * infrastructure layer can map without lookup tables, but the domain never
 * imports generated Prisma code — the dependency points inward only.
 */

export const USER_ROLES = ['ADMIN', 'MANAGER', 'OPERATOR'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const MOVEMENT_TYPES = ['INBOUND', 'OUTBOUND'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/**
 * State of an admin-provisioned user's WorkOS invitation. `null` on the User
 * entity (not part of this union) means the user is outside the invite flow
 * entirely — a self-onboarded admin, or a row that predates this feature.
 */
export const INVITATION_STATUSES = ['PENDING', 'ACCEPTED', 'SKIPPED'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];
