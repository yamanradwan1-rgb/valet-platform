import { apiErrorSchema } from "@valet/contracts";

export type DashboardApiErrorKind =
  | "auth"
  | "mfa"
  | "authorization"
  | "entitlement"
  | "validation"
  | "conflict"
  | "network"
  | "malformed"
  | "unknown";

interface DashboardApiErrorOptions {
  readonly kind: DashboardApiErrorKind;
  readonly message: string;
  readonly status?: number | undefined;
  readonly code?: string | undefined;
  readonly requestId?: string | undefined;
  readonly cause?: unknown | undefined;
}

export class DashboardApiError extends Error {
  readonly kind: DashboardApiErrorKind;
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  override readonly cause?: unknown;

  constructor(options: DashboardApiErrorOptions) {
    super(options.message);
    this.name = "DashboardApiError";
    this.kind = options.kind;
    this.status = options.status ?? 0;
    this.code = options.code ?? "UNKNOWN_ERROR";
    this.requestId = options.requestId ?? null;
    this.cause = options.cause;
  }
}

function classify(status: number, code: string): DashboardApiErrorKind {
  if (code.startsWith("MFA_") || code.includes("MFA_")) return "mfa";
  if (
    code.includes("ENTITLEMENT") ||
    code.includes("SUBSCRIPTION") ||
    code.includes("DASHBOARD_ACCESS")
  ) {
    return "entitlement";
  }
  if (status === 401 || code.startsWith("STAFF_AUTHENTICATION")) return "auth";
  if (status === 403 || status === 404) return "authorization";
  if (status === 400 || status === 422) return "validation";
  if (status === 409) return "conflict";
  return "unknown";
}

export function dashboardApiDisplayMessage(kind: DashboardApiErrorKind): string {
  switch (kind) {
    case "auth":
      return "Authentication is required.";
    case "mfa":
      return "Additional verification is required.";
    case "authorization":
      return "This action is not authorized.";
    case "entitlement":
      return "This feature is not available for the current subscription.";
    case "validation":
      return "The request was not valid.";
    case "conflict":
      return "The resource changed. Refresh and try again.";
    case "network":
      return "The network request could not be completed.";
    case "malformed":
      return "The server returned an invalid response.";
    default:
      return "The request could not be completed.";
  }
}

export function dashboardApiErrorFromResponse(
  status: number,
  payload: unknown,
): DashboardApiError {
  const parsed = apiErrorSchema.safeParse(payload);
  const code = parsed.success ? parsed.data.code : "HTTP_ERROR";
  const kind = classify(status, code);
  return new DashboardApiError({
    kind,
    status,
    code,
    message: parsed.success ? parsed.data.message : dashboardApiDisplayMessage(kind),
    requestId: parsed.success ? parsed.data.requestId : undefined,
  });
}

export function dashboardNetworkError(cause?: unknown): DashboardApiError {
  return new DashboardApiError({
    kind: "network",
    code: "NETWORK_ERROR",
    message: dashboardApiDisplayMessage("network"),
    cause,
  });
}

export function dashboardMalformedError(cause?: unknown): DashboardApiError {
  return new DashboardApiError({
    kind: "malformed",
    code: "MALFORMED_RESPONSE",
    message: dashboardApiDisplayMessage("malformed"),
    cause,
  });
}

export function dashboardAuthBoundaryError(): DashboardApiError {
  return new DashboardApiError({
    kind: "auth",
    code: "AUTH_STATE_CHANGED",
    message: "The authenticated session changed while the request was running.",
    status: 401,
  });
}

export function dashboardMutationRetryRequiredError(cause?: unknown): DashboardApiError {
  return new DashboardApiError({
    kind: "auth",
    code: "AUTH_RECONCILED_RETRY_REQUIRED",
    message: "Authentication was refreshed after the write was rejected. Review and retry the action.",
    status: 401,
    cause,
  });
}
