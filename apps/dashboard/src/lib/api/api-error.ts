interface ApiErrorPayload {
  readonly code?: unknown;
  readonly message?: unknown;
  readonly requestId?: unknown;
  readonly retryAfter?: unknown;
}

export type DashboardApiFailureKind =
  | "session-expired"
  | "forbidden"
  | "authorization-masked"
  | "conflict"
  | "validation"
  | "rate-limited"
  | "not-found"
  | "server"
  | "network";

/**
 * Normalized dashboard transport failure.
 *
 * `kind` drives shell-level routing (session expiry, denial) while `code`
 * preserves the exact backend error code for feature surfaces. A 404 is
 * preserved as `authorization-masked` when the backend intentionally masks
 * authorization denials as NOT_FOUND (AUTHORIZATION_DENIED,
 * LOCATION_ACCESS_DENIED, TENANT_ACCESS_DENIED).
 */
export class DashboardApiError extends Error {
  readonly kind: DashboardApiFailureKind;
  readonly status: number;
  readonly code: string;
  readonly retryAfter?: number | undefined;
  readonly isNetworkError: boolean;

  constructor(options: {
    kind: DashboardApiFailureKind;
    status: number;
    code: string;
    message: string;
    retryAfter?: number | undefined;
    isNetworkError?: boolean | undefined;
  }) {
    super(options.message);
    this.name = "DashboardApiError";
    this.kind = options.kind;
    this.status = options.status;
    this.code = options.code;
    this.retryAfter = options.retryAfter;
    this.isNetworkError = options.isNetworkError ?? false;
  }
}

const AUTHORIZATION_MASKED_CODES = new Set([
  "AUTHORIZATION_DENIED",
  "LOCATION_ACCESS_DENIED",
  "TENANT_ACCESS_DENIED",
]);

function classify(status: number, code: string): DashboardApiFailureKind {
  if (status === 401) return "session-expired";
  if (status === 403) return "forbidden";
  if (status === 404) {
    return AUTHORIZATION_MASKED_CODES.has(code)
      ? "authorization-masked"
      : "not-found";
  }
  if (status === 409) return "conflict";
  if (status === 422) return "validation";
  if (status === 429) return "rate-limited";
  if (status === 400) return "validation";
  return "server";
}

export function mapDashboardApiError(
  status: number,
  payload: unknown,
): DashboardApiError {
  const body = (
    typeof payload === "object" && payload !== null ? payload : {}
  ) as ApiErrorPayload;
  const code =
    typeof body.code === "string" && body.code.length > 0
      ? body.code
      : "REQUEST_FAILED";
  const message =
    typeof body.message === "string" && body.message.length > 0
      ? body.message
      : "The operation could not be completed.";
  const retryAfter =
    typeof body.retryAfter === "number" ? body.retryAfter : undefined;
  return new DashboardApiError({
    kind: classify(status, code),
    status,
    code,
    message,
    retryAfter,
  });
}

export function mapNetworkError(): DashboardApiError {
  return new DashboardApiError({
    kind: "server",
    status: 0,
    code: "NETWORK_ERROR",
    message: "Network connection unavailable.",
    isNetworkError: true,
  });
}
