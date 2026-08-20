import { apiErrorSchema } from "@valet/contracts";

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

function defaultStatusToCode(status: number): string {
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "STAFF_AUTHENTICATION_REQUIRED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 408:
      return "REQUEST_TIMEOUT";
    case 409:
      return "CONFLICT";
    case 429:
      return "RATE_LIMITED";
    case 500:
      return "INTERNAL_SERVER_ERROR";
    case 502:
      return "BAD_GATEWAY";
    case 503:
      return "SERVICE_UNAVAILABLE";
    case 504:
      return "GATEWAY_TIMEOUT";
    default:
      return "API_ERROR";
  }
}

export function normalizeEmployeeApiError(
  status: number,
  payload: unknown,
  defaultMessage = "An error occurred while processing your request.",
): EmployeeApiError {
  const parsed = apiErrorSchema.safeParse(payload);
  if (parsed.success) {
    return new EmployeeApiError({
      status,
      code: parsed.data.code,
      message: parsed.data.message,
      requestId: parsed.data.requestId,
    });
  }

  if (
    payload !== null &&
    typeof payload === "object" &&
    "code" in payload &&
    typeof (payload as { code: unknown }).code === "string"
  ) {
    const codeObj = payload as {
      code: string;
      message?: unknown;
      requestId?: unknown;
      retryAfter?: unknown;
    };
    return new EmployeeApiError({
      status,
      code: codeObj.code,
      message:
        typeof codeObj.message === "string" && codeObj.message.trim().length > 0
          ? codeObj.message
          : defaultMessage,
      requestId:
        typeof codeObj.requestId === "string" ? codeObj.requestId : undefined,
      retryAfter:
        typeof codeObj.retryAfter === "number" ? codeObj.retryAfter : undefined,
    });
  }

  return new EmployeeApiError({
    status,
    code: defaultStatusToCode(status),
    message: defaultMessage,
  });
}
