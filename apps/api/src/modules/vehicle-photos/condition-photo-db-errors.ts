export type ConditionPhotoDbPublicCode =
  | "CONDITION_PHOTO_OPERATION_CONFLICT"
  | "CONDITION_PHOTO_NOT_FOUND"
  | "CONDITION_PHOTO_LIMIT_REACHED"
  | "CONDITION_PHOTO_EXPIRED"
  | "CONDITION_PHOTO_RATE_LIMITED"
  | "CONDITION_PHOTO_STORAGE_UNAVAILABLE";

export class ConditionPhotoDatabaseError extends Error {
  readonly retryAfter?: number;
  constructor(readonly code: ConditionPhotoDbPublicCode) {
    super("The photo operation could not be completed.");
    if (code === "CONDITION_PHOTO_RATE_LIMITED") this.retryAfter = 5;
  }
}

/**
 * Only fixed SQLSTATEs from the P1 checked entrypoints are publicly mapped.
 * Never expose arbitrary PostgreSQL detail/message or actual constraint names.
 */
export function safeConditionPhotoDbError(error: unknown): Error {
  if (error instanceof ConditionPhotoDatabaseError) return error;
  const failure = error as { code?: unknown; message?: unknown } | null;
  const code = failure?.code;
  if (code === "23505")
    return new ConditionPhotoDatabaseError("CONDITION_PHOTO_OPERATION_CONFLICT");
  if (code === "42501")
    return new ConditionPhotoDatabaseError("CONDITION_PHOTO_NOT_FOUND");
  if (code === "53300") {
    if (failure?.message === "Condition photo session maximum reached")
      return new ConditionPhotoDatabaseError("CONDITION_PHOTO_LIMIT_REACHED");
    if (failure?.message === "Condition photo concurrent upload limit reached")
      return new ConditionPhotoDatabaseError("CONDITION_PHOTO_RATE_LIMITED");
    // PostgreSQL uses the same SQLSTATE for global too_many_connections.
    // Fail temporarily instead of presenting a permanent session quota.
    return new ConditionPhotoDatabaseError("CONDITION_PHOTO_STORAGE_UNAVAILABLE");
  }
  if (code === "55000") {
    const expired = typeof failure?.message === "string" &&
      /\b(expired|no longer recoverable)\b/i.test(failure.message);
    return new ConditionPhotoDatabaseError(expired
      ? "CONDITION_PHOTO_EXPIRED"
      : "CONDITION_PHOTO_OPERATION_CONFLICT");
  }
  if (code === "57014")
    return new ConditionPhotoDatabaseError("CONDITION_PHOTO_STORAGE_UNAVAILABLE");
  return error instanceof Error ? error : new Error("Unknown database failure.");
}
