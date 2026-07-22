-- Makes MANAGER/OPERATOR permissions editable per-organization (role_permissions)
-- and adds per-user grant/revoke exceptions (user_permission_overrides).
-- ADMIN permissions are intentionally never represented here — they stay the
-- fixed list in core/application/auth/permissions.ts.
--
-- Presence of a role_permissions row = granted. Every existing organization
-- is backfilled below with rows matching today's hardcoded MANAGER/OPERATOR
-- matrix, so behavior is unchanged until an admin edits it — this is a
-- one-time snapshot of that matrix, not a live reference to the code.

-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('GRANT', 'REVOKE');

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permission_overrides" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "role_permissions_organizationId_role_idx" ON "role_permissions"("organizationId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_organizationId_role_permission_key" ON "role_permissions"("organizationId", "role", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "user_permission_overrides_userId_permission_key" ON "user_permission_overrides"("userId", "permission");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: seed every existing organization's MANAGER/OPERATOR permissions
-- to match today's hardcoded ROLE_PERMISSIONS matrix (see permissions.ts).
INSERT INTO "role_permissions" ("id", "organizationId", "role", "permission")
SELECT 'rp_' || o."id" || '_manager_' || replace(p, ':', '_'), o."id", 'MANAGER', p
FROM "organizations" o
CROSS JOIN unnest(ARRAY[
    'warehouses:read',
    'inventory:manage',
    'inventory:read',
    'movements:create',
    'movements:read',
    'movements:manage',
    'analytics:read'
]) AS p;

INSERT INTO "role_permissions" ("id", "organizationId", "role", "permission")
SELECT 'rp_' || o."id" || '_operator_' || replace(p, ':', '_'), o."id", 'OPERATOR', p
FROM "organizations" o
CROSS JOIN unnest(ARRAY[
    'warehouses:read',
    'inventory:manage',
    'inventory:read',
    'movements:create',
    'movements:read',
    'analytics:read'
]) AS p;
