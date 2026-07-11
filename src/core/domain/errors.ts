/**
 * Domain error hierarchy. Errors carry a machine-readable `code`; the API
 * layer owns the mapping from codes to HTTP status so the domain stays
 * transport-agnostic.
 */

export type DomainErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INSUFFICIENT_STOCK'
  | 'CAPACITY_EXCEEDED'
  | 'BUSINESS_RULE_VIOLATION';

export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.details = details;
  }
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';
}

export class UnauthorizedError extends DomainError {
  readonly code = 'UNAUTHORIZED';
  constructor(message = 'Authentication required.') {
    super(message);
  }
}

export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  constructor(message = 'You do not have permission to perform this action.') {
    super(message);
  }
}

/**
 * Also raised when a resource exists but belongs to another tenant or to a
 * warehouse outside the caller's scope — deliberately indistinguishable from
 * "does not exist" so no cross-tenant existence information leaks.
 */
export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  constructor(resource: string, id?: string) {
    super(id ? `${resource} '${id}' was not found.` : `${resource} was not found.`);
  }
}

export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
}

export class InsufficientStockError extends DomainError {
  readonly code = 'INSUFFICIENT_STOCK';
  constructor(sku: string, requested: number, available: number) {
    super(`Cannot move ${requested} units of ${sku}: only ${available} on hand.`, {
      sku,
      requested,
      available,
    });
  }
}

export class CapacityExceededError extends DomainError {
  readonly code = 'CAPACITY_EXCEEDED';
  /** `requiredCapacity`/`remainingCapacity` are in storage units, not item units. */
  constructor(warehouseName: string, requiredCapacity: number, remainingCapacity: number) {
    super(
      `Receiving this quantity would require ${requiredCapacity} storage units, but ${warehouseName} only has ${remainingCapacity} remaining.`,
      { warehouseName, requiredCapacity, remainingCapacity },
    );
  }
}

export class BusinessRuleViolationError extends DomainError {
  readonly code = 'BUSINESS_RULE_VIOLATION';
}
