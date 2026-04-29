/**
 * src/lib/ui/errorMessages.ts
 *
 * Pure helper for classifying and rendering API / Firestore error messages.
 * Used by data pages to avoid crashing with red overlays on known setup errors.
 *
 * No React, no Firestore, no side effects.
 */

export type ErrorKind = 'index' | 'quota' | 'engine' | 'generic';

/** Classify an error message string into a user-facing kind. */
export function classifyError(msg: string): ErrorKind {
  const m = String(msg ?? '').toLowerCase();
  if (m.includes('failed_precondition') || m.includes('requires an index') || m.includes('firestore index')) {
    return 'index';
  }
  if (m.includes('resource_exhausted') || m.includes('quota') || m.includes('429')) {
    return 'quota';
  }
  if (m.includes('engine') && (m.includes('unreachable') || m.includes('connect') || m.includes('econnrefused'))) {
    return 'engine';
  }
  return 'generic';
}

/** Return a concise user-facing string for a classified error kind. */
export function errorMessage(kind: ErrorKind, fallback?: string): string {
  switch (kind) {
    case 'index':
      return 'Firestore index required. Create the suggested Firebase index, wait until it is enabled, then refresh.';
    case 'quota':
      return 'Firebase read quota is temporarily exhausted. Try again after reset or reduce testing.';
    case 'engine':
      return 'Lottery engine is currently unreachable. Check Railway deployment and try again.';
    default:
      return fallback || 'Could not load this data right now.';
  }
}

/**
 * Given a raw error (from catch), produce a display-ready { kind, message } pair.
 * Handles both thrown Error objects and API response objects with an `.error` field.
 */
export function parseError(err: unknown): { kind: ErrorKind; message: string } {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const kind = classifyError(raw);
  return { kind, message: errorMessage(kind, raw) };
}

/**
 * Given an API response object (already json-parsed), check if it signals a
 * known error kind. Returns null if the response is ok or has no error field.
 */
export function parseApiError(data: any): { kind: ErrorKind; message: string } | null {
  if (!data || data.ok) return null;
  const raw = String(data.error ?? '');
  if (!raw) return null;
  const kind = classifyError(raw);
  return { kind, message: errorMessage(kind, raw) };
}
