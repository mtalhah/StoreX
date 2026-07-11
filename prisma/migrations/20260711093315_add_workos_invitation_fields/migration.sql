-- Tracks WorkOS invitation state for admin-provisioned users (see
-- AuthDirectory.sendInvitation). Null invitationStatus means the user is
-- outside the invite flow: a self-onboarded admin (linked at creation time)
-- or a row that predates this feature.

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'SKIPPED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "invitationStatus" "InvitationStatus",
ADD COLUMN     "invitedAt" TIMESTAMP(3),
ADD COLUMN     "workosInvitationId" TEXT;
