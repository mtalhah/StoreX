import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { DomainError, type DomainErrorCode } from '@/core/domain/errors';
import type { Paginated } from '@/core/application/dto/common';

/**
 * Consistent response envelope for every endpoint:
 *   success → { success: true,  data, meta? }
 *   failure → { success: false, error: { code, message, details? } }
 */

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

// The API layer owns the transport mapping for domain error codes.
const STATUS_BY_CODE: Record<DomainErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INSUFFICIENT_STOCK: 409,
  CAPACITY_EXCEEDED: 409,
  BUSINESS_RULE_VIOLATION: 422,
};

export function ok<T>(data: T, init?: { status?: number; meta?: PaginationMeta }): NextResponse {
  return NextResponse.json(
    { success: true, data, ...(init?.meta ? { meta: init.meta } : {}) },
    { status: init?.status ?? 200 },
  );
}

export function okPaginated<T>(result: Paginated<T>): NextResponse {
  const { items, ...meta } = result;
  return ok(items, { meta });
}

export function created<T>(data: T): NextResponse {
  return ok(data, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function failure(code: string, message: string, status: number, details?: unknown): NextResponse {
  return NextResponse.json(
    { success: false, error: { code, message, ...(details !== undefined ? { details } : {}) } },
    { status },
  );
}

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return failure(
      'VALIDATION_ERROR',
      'Request validation failed.',
      400,
      error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }

  if (error instanceof DomainError) {
    return failure(error.code, error.message, STATUS_BY_CODE[error.code], error.details);
  }

  // Unknown errors: log server-side, never leak internals to the client.
  console.error('[api] Unhandled error:', error);
  return failure('INTERNAL_ERROR', 'An unexpected error occurred.', 500);
}
