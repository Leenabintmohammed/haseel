/** Uniform, machine-readable error contract shared by every backend operation. */
export type DuelyErrorCode =
  | "not_found"
  | "validation_failed"
  | "invalid_state_transition"
  | "invoice_locked"
  | "amount_exceeds_balance"
  | "duplicate_request"
  | "forbidden"
  | "conflict"
  | "internal_error";

export type DuelyFailure = {
  error: DuelyErrorCode | string;
  message: string;
  details?: Record<string, unknown>;
};

export function fail(
  error: DuelyErrorCode | string,
  message: string,
  details?: Record<string, unknown>,
): DuelyFailure {
  return details ? { error, message, details } : { error, message };
}

export function isFailure(value: unknown): value is DuelyFailure {
  return Boolean(value) && typeof value === "object" && "error" in (value as Record<string, unknown>);
}
