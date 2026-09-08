import { apiErrorSchema } from "@valet/contracts/api-errors";

export interface EmployeeApiErrorParams {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly requestId?: string | undefined;
  readonly retryAfter?: number | undefined;
  readonly isNetworkError?: boolean | undefined;
}

export class EmployeeApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string | undefined;
  readonly retryAfter?: number | undefined;
  readonly isNetworkError: boolean;

  constructor(params: EmployeeApiErrorParams) {
    super(params.message);
    this.name = "EmployeeApiError";
    this.status = params.status;
    this.code = params.code;
    this.requestId = params.requestId;
    this.retryAfter = params.retryAfter;
    this.isNetworkError = params.isNetworkError ?? false;
  }
}

export function normalizeEmployeeApiError(
  status: number,
  payload: unknown,
  defaultMessage = "An error occurred while processing your request.",
  retryAfter?: number,
): EmployeeApiError {
  const parsed = apiErrorSchema.safeParse(payload);
  if (parsed.success) {
    return new EmployeeApiError({
      status,
      code: parsed.data.code,
      message: parsed.data.message,
      requestId: parsed.data.requestId,
      retryAfter,
    });
  }

  if (hasStringCode(payload)) {
    return new EmployeeApiError({
      status,
      code: payload.code,
      message:
        typeof payload.message === "string" && payload.message.trim().length > 0
          ? payload.message
          : defaultMessage,
      requestId:
        typeof payload.requestId === "string" ? payload.requestId : undefined,
      retryAfter:
        retryAfter ??
        (typeof payload.retryAfter === "number"
          ? payload.retryAfter
          : undefined),
    });
  }

  return new EmployeeApiError({
    status,
    code: defaultStatusToCode(status),
    message: defaultMessage,
    retryAfter,
  });
}

export function employeeNetworkError(): EmployeeApiError {
  return new EmployeeApiError({
    status: 0,
    code: "NETWORK_ERROR",
    message:
      "Network connection unavailable. Please check your internet connection.",
    isNetworkError: true,
  });
}

export function employeeSessionServiceUnavailableError(): EmployeeApiError {
  return new EmployeeApiError({
    status: 503,
    code: "STAFF_SESSION_SERVICE_UNAVAILABLE",
    message:
      "Staff sign-in service is temporarily unavailable. Please try again.",
    isNetworkError: true,
  });
}

export function employeeAuthenticationRequiredError(): EmployeeApiError {
  return new EmployeeApiError({
    status: 401,
    code: "STAFF_AUTHENTICATION_REQUIRED",
    message: "Staff authentication required.",
  });
}

function hasStringCode(payload: unknown): payload is {
  code: string;
  message?: unknown;
  requestId?: unknown;
  retryAfter?: unknown;
} {
  return (
    payload !== null &&
    typeof payload === "object" &&
    "code" in payload &&
    typeof payload.code === "string"
  );
}

function defaultStatusToCode(status: number): string {
  const statusCodes: Readonly<Record<number, string>> = {
    400: "BAD_REQUEST",
    401: "STAFF_AUTHENTICATION_REQUIRED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    408: "REQUEST_TIMEOUT",
    409: "CONFLICT",
    429: "RATE_LIMITED",
    500: "INTERNAL_SERVER_ERROR",
    502: "BAD_GATEWAY",
    503: "SERVICE_UNAVAILABLE",
    504: "GATEWAY_TIMEOUT",
  };
  return statusCodes[status] ?? "API_ERROR";
}
