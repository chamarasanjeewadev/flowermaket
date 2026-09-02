/**
 * Shared error + result primitives for the data layer.
 *
 * Server functions return `ActionResult<T>` instead of throwing so the UI can
 * render friendly, localized error states without try/catch gymnastics.
 */

/** Thrown when a caller demands a live database but DATABASE_URL is not set. */
export class DataUnavailableError extends Error {
  constructor(message = "Database is not configured (DATABASE_URL is unset).") {
    super(message);
    this.name = "DataUnavailableError";
  }
}

export type ActionErrorCode =
  | "db_unavailable"
  | "auth_required"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "unknown";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ActionErrorCode; message: string };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function err<T = never>(
  code: ActionErrorCode,
  message: string,
): ActionResult<T> {
  return { ok: false, code, message };
}

/**
 * Narrow an unknown thrown value to a Postgres error with the given SQLSTATE
 * code (e.g. 23505 unique_violation, 23503 foreign_key_violation).
 * postgres-js raises `PostgresError` with a `code` property; transactions may
 * re-wrap it, so we also inspect `cause`.
 */
export function isPgError(e: unknown, code: string): boolean {
  if (typeof e !== "object" || e === null) return false;
  const candidate = e as { code?: unknown; cause?: unknown };
  if (candidate.code === code) return true;
  return candidate.cause !== undefined && isPgError(candidate.cause, code);
}
