import type { Prisma } from '@/generated/prisma/client';
import type { PrismaClient } from '../db/prisma';
import type {
  IdentityRepository,
  UserWithAccess,
} from '@/core/application/ports/identity-repository';

const accessInclude = {
  warehouseAssignments: { select: { warehouseId: true } },
} satisfies Prisma.UserInclude;

type UserRow = Prisma.UserGetPayload<{ include: typeof accessInclude }>;

function toDto(row: UserRow): UserWithAccess {
  const { warehouseAssignments, ...user } = row;
  return { ...user, assignedWarehouseIds: warehouseAssignments.map((a) => a.warehouseId) };
}

/**
 * Sign-in bootstrap only — see the port's contract note. Used before a
 * TenantContext exists, so it is the single deliberately unscoped repository.
 */
export class PrismaIdentityRepository implements IdentityRepository {
  constructor(private readonly db: PrismaClient) {}

  async findByWorkosUserId(workosUserId: string): Promise<UserWithAccess | null> {
    const row = await this.db.user.findUnique({
      where: { workosUserId },
      include: accessInclude,
    });
    return row ? toDto(row) : null;
  }

  async findUnlinkedByEmail(email: string): Promise<UserWithAccess | null> {
    // If the same email was provisioned in several organizations, link the
    // earliest invitation first (documented limitation; full multi-org
    // membership would need an org-switcher and a membership table).
    const row = await this.db.user.findFirst({
      where: { email: email.toLowerCase(), workosUserId: null },
      orderBy: { createdAt: 'asc' },
      include: accessInclude,
    });
    return row ? toDto(row) : null;
  }

  async linkWorkosUser(
    userId: string,
    workosUserId: string,
    profile: { firstName?: string; lastName?: string },
  ): Promise<UserWithAccess> {
    const row = await this.db.user.update({
      where: { id: userId },
      data: {
        workosUserId,
        // Fill profile fields from the identity provider only when the
        // admin left them blank at provisioning time.
        ...(profile.firstName ? { firstName: { set: profile.firstName } } : {}),
        ...(profile.lastName ? { lastName: { set: profile.lastName } } : {}),
      },
      include: accessInclude,
    });
    return toDto(row);
  }

  async createOrganizationWithAdmin(input: {
    organizationName: string;
    workosUserId: string;
    email: string;
    firstName?: string;
    lastName?: string;
  }): Promise<UserWithAccess> {
    const row = await this.db.user.create({
      data: {
        workosUserId: input.workosUserId,
        email: input.email.toLowerCase(),
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        role: 'ADMIN',
        organization: { create: { name: input.organizationName } },
      },
      include: accessInclude,
    });
    return toDto(row);
  }
}
