import {
  BusinessRuleViolationError,
  NotFoundError,
  ValidationError,
} from '@/core/domain/errors';
import { authorize, Permission } from '../auth/permissions';
import type { TenantContext } from '../auth/tenant-context';
import type { Paginated } from '../dto/common';
import { WORKOS_ROLE_SLUGS, type AuthDirectory, type SentInvitation } from '../ports/auth-directory';
import type {
  CreateUserInput,
  UpdateUserData,
  UserListQuery,
  UserRepository,
  UserWithAssignments,
} from '../ports/user-repository';
import type { UserRole } from '@/core/domain/enums';

export class UserService {
  constructor(
    private readonly ctx: TenantContext,
    private readonly users: UserRepository,
    private readonly directory: AuthDirectory,
  ) {}

  async list(query: UserListQuery): Promise<Paginated<UserWithAssignments>> {
    authorize(this.ctx, Permission.UsersRead);
    return this.users.findMany(query);
  }

  async get(id: string): Promise<UserWithAssignments> {
    authorize(this.ctx, Permission.UsersRead);
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError('User', id);
    return user;
  }

  /**
   * Provisions a user inside the admin's organization: validates role/
   * warehouse assignment rules, then sends a WorkOS invitation for the
   * tenant's WorkOS Organization BEFORE writing any local row — so a failed
   * invitation (required in production; see AuthDirectory) never leaves a
   * local user with no way to actually sign in. The invitee accepts the
   * email invite, WorkOS creates/links their WorkOS user and Organization
   * Membership, and UserSyncService links that identity to this row by email
   * on first sign-in.
   */
  async create(input: CreateUserInput): Promise<UserWithAssignments> {
    authorize(this.ctx, Permission.UsersManage);
    await this.validateAssignments(input.role, input.warehouseIds);

    const organization = await this.users.getOrganization();
    let invitation: SentInvitation | null;
    try {
      invitation = await this.directory.sendInvitation({
        organizationId: organization.workosOrgId,
        email: input.email,
        roleSlug: WORKOS_ROLE_SLUGS[input.role],
        inviterWorkosUserId: this.ctx.workosUserId ?? undefined,
      });
    } catch {
      throw new BusinessRuleViolationError(
        `Could not send a WorkOS invitation to ${input.email}; the user was not created. Try again shortly.`,
      );
    }

    return this.users.create({
      ...input,
      workosInvitationId: invitation?.id ?? null,
      invitationStatus: invitation ? 'PENDING' : 'SKIPPED',
      invitedAt: invitation ? new Date() : null,
    });
  }

  async update(id: string, data: UpdateUserData): Promise<UserWithAssignments> {
    authorize(this.ctx, Permission.UsersManage);
    const existing = await this.users.findById(id);
    if (!existing) throw new NotFoundError('User', id);

    if (id === this.ctx.userId && data.role !== undefined && data.role !== this.ctx.role) {
      throw new BusinessRuleViolationError('You cannot change your own role.');
    }

    const role = data.role ?? existing.role;
    const warehouseIds =
      data.warehouseIds ?? existing.warehouses.map((w) => w.id);
    await this.validateAssignments(role, warehouseIds);

    const updated = await this.users.update(id, { ...data, role, warehouseIds });
    if (!updated) throw new NotFoundError('User', id);
    return updated;
  }

  async remove(id: string): Promise<void> {
    authorize(this.ctx, Permission.UsersManage);
    if (id === this.ctx.userId) {
      throw new BusinessRuleViolationError('You cannot remove your own account.');
    }
    const deleted = await this.users.delete(id);
    if (!deleted) throw new NotFoundError('User', id);
  }

  /** Role/assignment invariants live here, in one place. */
  private async validateAssignments(role: UserRole, warehouseIds: string[]): Promise<void> {
    if (role === 'OPERATOR' && warehouseIds.length !== 1) {
      throw new ValidationError('Operators must be assigned to exactly one warehouse.');
    }
    if (role === 'MANAGER' && warehouseIds.length === 0) {
      throw new ValidationError('Managers must be assigned to at least one warehouse.');
    }
    if (role === 'ADMIN' && warehouseIds.length > 0) {
      throw new ValidationError('Admins have organization-wide access; do not assign warehouses.');
    }
    if (warehouseIds.length > 0) {
      const existing = await this.users.existingWarehouseIds(warehouseIds);
      const missing = warehouseIds.filter((id) => !existing.includes(id));
      if (missing.length > 0) {
        throw new NotFoundError('Warehouse', missing[0]);
      }
    }
  }
}
