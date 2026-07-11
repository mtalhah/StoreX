'use client';

import { useState } from 'react';
import { ApiError } from './api';

export type FieldErrors = Record<string, string>;

/**
 * Inline-validation state for modal forms: field-level errors shown as a red
 * border + message under the input, instead of a toast. Server-side
 * VALIDATION_ERROR responses (zod issues, `path`+`message` pairs) are mapped
 * onto the same field errors when possible; other error codes (conflict,
 * insufficient stock, forbidden, ...) are left for the caller to toast.
 */
export function useFieldErrors() {
  const [errors, setErrors] = useState<FieldErrors>({});

  const setError = (field: string, message: string) =>
    setErrors((e) => ({ ...e, [field]: message }));

  const clearErrors = () => setErrors({});

  /** Returns true if the error was a validation error and was applied to field state. */
  const applyApiError = (err: unknown): boolean => {
    if (err instanceof ApiError && err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
      const next: FieldErrors = {};
      for (const issue of err.details as Array<{ path?: string; message: string }>) {
        if (issue.path) next[issue.path] = issue.message;
      }
      if (Object.keys(next).length > 0) {
        setErrors(next);
        return true;
      }
    }
    return false;
  };

  return { errors, setError, setErrors, clearErrors, applyApiError };
}
