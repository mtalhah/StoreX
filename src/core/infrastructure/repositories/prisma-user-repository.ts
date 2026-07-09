import type { Prisma } from '@/generated/prisma/client';
import type { PrismaClient } from '../db/prisma';
import type { TenantContext } from '@/core/application/auth/tenant-context';
import type { Paginated } from '@/core/application/dto/common';
import { paginate } from '@/core/application/dto/common';
import type {
  CreateUserData,
  UpdateUserData,
  UserListQuery,
  UserRepository,
  UserWithAssignments,
} from '@/core/application/ports/user-repository';
import { ConflictError } from '@/core/domain/errors';
import { isForeignKeyViolation, isUniqueConstraintViolation } from './prisma-errors';

const userInclude = {
  warehouseAssignments: { include: { warehouse: { select: { id: true, name: true } } } },
} satisfies Prisma.UserInclude;

type UserRow = Prisma.UserGetPayload<{ include: typeof userInclude }>;

function toDto(row: UserRow): UserWithAssignments {
  const { warehouseAssignments, ...user } = row;
  return { ...user, warehouses: warehouseAssignments.map((a) => a.warehouse) };
}

export class PrismaUserRepository implements UserRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly ctx: TenantContext,
  ) {}

  private get scopedWhere(): Prisma.UserWhereInput {
    // Users are organization-scoped, not warehouse-scoped: only Admins reach
    // this repository (enforced by UserService permissions).
    return { organizationId: this.ctx.organizationId };
  }

  async findMany(query: UserListQuery): Promise<Paginated<UserWithAssignments>> {
    const where: Prisma.UserWhereInput = {
      AND: [
        this.scopedWhere,
        query.role ? { role: query.role } : {},
        query.search
          ? {
              OR: [
                { email: { contains: query.search, mode: 'insensitive' } },
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };

    const [rows, totalItems] = await Promise.all([
      this.db.user.findMany({
        where,
        include: userInclude,
        orderBy: { [query.sortBy]: query.sortDir },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.user.count({ where }),
    ]);

    return paginate(rows.map(toDto), totalItems, query);
  }

  async findById(id: string): Promise<UserWithAssignments | null> {
    const row = await this.db.user.findFirst({
      where: { AND: [this.scopedWhere, { id }] },
      include: userInclude,
    });
    return row ? toDto(row) : null;
  }

  async create(data: CreateUserData): Promise<UserWithAssignments> {
    try {
      const row = await this.db.user.create({
        data: {
          email: data.email.toLowerCase(),
          firstName: data.firstName ?? null,
          lastName: data.lastName ?? null,
          role: data.role,
          organizationId: this.ctx.organizationId,
          warehouseAssignments: {
            create: data.warehouseIds.map((warehouseId) => ({ warehouseId })),
          },
        },
        include: userInclude,
      });
      return toDto(row);
    } catch (e) {
      if (isUniqueConstraintViolation(e)) {
        throw new ConflictError(`A user with email '${data.email}' already exists in this organization.`);
      }
      throw e;
    }
  }

  async update(id: string, data: UpdateUserData): Promise<UserWithAssignments | null> {
    const existing = await this.db.user.findFirst({ where: { AND: [this.scopedWhere, { id }] } });
    if (!existing) return null;

    const row = await this.db.$transaction(async (tx) => {
      if (data.warehouseIds !== undefined) {
        await tx.warehouseAssignment.deleteMany({ where: { userId: id } });
        await tx.warehouseAssignment.createMany({
          data: data.warehouseIds.map((warehouseId) => ({ userId: id, warehouseId })),
        });
      }
      return tx.user.update({
        where: { id },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          role: data.role,
          isActive: data.isActive,
        },
        include: userInclude,
      });
    });

    return toDto(row);
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.db.user.deleteMany({ where: { AND: [this.scopedWhere, { id }] } });
      return result.count > 0;
    } catch (e) {
      if (isForeignKeyViolation(e)) {
        // Movement history references this user (FK RESTRICT): the audit
        // trail is immutable, so removal means deactivation.
        throw new ConflictError(
          'This user has recorded stock movements and cannot be deleted. Deactivate the account instead.',
        );
      }
      throw e;
    }
  }

  async existingWarehouseIds(ids: string[]): Promise<string[]> {
    const rows = await this.db.warehouse.findMany({
      where: { organizationId: this.ctx.organizationId, id: { in: ids } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}
