import {
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from "@nestjs/common";

export class ApiTransportValidationError extends Error {
  constructor() {
    super("The request is invalid.");
    this.name = "ApiTransportValidationError";
  }
}

interface CodedError {
  readonly code?: unknown;
  readonly message?: unknown;
}

export interface MappedApiError {
  readonly code: string;
  readonly message: string;
  readonly retryAfter?: number;
  readonly status: number;
}

const statusByCode: Readonly<Record<string, number>> = {
  ACTIVE_SHIFT_CONFLICT: HttpStatus.CONFLICT,
  ACTIVE_VALET_SESSION_CONFLICT: HttpStatus.CONFLICT,
  AUTHORIZATION_DENIED: HttpStatus.NOT_FOUND,
  CHECK_IN_CONDITION_PHOTO_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  CHECK_IN_EVIDENCE_REQUEST_INVALID: HttpStatus.BAD_REQUEST,
  CONDITION_CHECK_INCOMPLETE: HttpStatus.UNPROCESSABLE_ENTITY,
  CONDITION_NOTE_ALREADY_SUPERSEDED: HttpStatus.CONFLICT,
  ANTI_ABUSE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  GUEST_ACCESS_INTENT_CONFLICT: HttpStatus.CONFLICT,
  GUEST_ACCESS_INVALID: HttpStatus.UNAUTHORIZED,
  GUEST_ACCESS_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  GUEST_ACCESS_REQUEST_INVALID: HttpStatus.BAD_REQUEST,
  IDEMPOTENCY_CONFLICT: HttpStatus.CONFLICT,
  INTAKE_INPUT_INVALID: HttpStatus.BAD_REQUEST,
  INVALID_STATE_TRANSITION: HttpStatus.CONFLICT,
  LOCATION_ACCESS_DENIED: HttpStatus.NOT_FOUND,
  STAFF_AUTHENTICATION_FAILED: HttpStatus.UNAUTHORIZED,
  STAFF_AUTHENTICATION_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  STAFF_AUTH_ORIGIN_NOT_ALLOWED: HttpStatus.FORBIDDEN,
  PHOTO_REQUIREMENT_NOT_SATISFIED: HttpStatus.UNPROCESSABLE_ENTITY,
  PHOTO_STORAGE_OBJECT_CONFLICT: HttpStatus.CONFLICT,
  TENANT_ACCESS_DENIED: HttpStatus.NOT_FOUND,
  VEHICLE_IDENTITY_CONFIRMATION_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  VEHICLE_IDENTITY_CONFLICT: HttpStatus.CONFLICT,
  VEHICLE_IDENTITY_CUSTODY_CONFLICT: HttpStatus.CONFLICT,
  VEHICLE_IDENTITY_INCOMPLETE: HttpStatus.UNPROCESSABLE_ENTITY,
  VEHICLE_IDENTITY_INVALID: HttpStatus.BAD_REQUEST,
  VEHICLE_IDENTITY_SESSION_NOT_MUTABLE: HttpStatus.CONFLICT,
  VEHICLE_IDENTITY_VERSION_CONFLICT: HttpStatus.CONFLICT,
  VERSION_CONFLICT: HttpStatus.CONFLICT,
};

const safeMessages: Readonly<Record<string, string>> = {
  ANTI_ABUSE_UNAVAILABLE: "Service temporarily unavailable.",
  AUTHORIZATION_DENIED: "The requested resource is not available.",
  GUEST_ACCESS_INVALID: "Guest access is invalid.",
  GUEST_ACCESS_RATE_LIMITED: "Too many requests. Try again later.",
  LOCATION_ACCESS_DENIED: "The requested resource is not available.",
  STAFF_AUTHENTICATION_FAILED: "Staff authentication failed.",
  STAFF_AUTHENTICATION_RATE_LIMITED: "Too many requests. Try again later.",
  STAFF_AUTH_ORIGIN_NOT_ALLOWED: "The request origin is not allowed.",
  TENANT_ACCESS_DENIED: "The requested resource is not available.",
};

export function mapApiError(error: unknown): MappedApiError {
  if (error instanceof ApiTransportValidationError) {
    return {
      code: "REQUEST_INVALID",
      message: error.message,
      status: HttpStatus.BAD_REQUEST,
    };
  }
  if (error instanceof UnauthorizedException) {
    return {
      code: "STAFF_AUTHENTICATION_REQUIRED",
      message: "Staff authentication is required.",
      status: HttpStatus.UNAUTHORIZED,
    };
  }
  const coded = error as CodedError;
  const code = typeof coded.code === "string" ? coded.code : undefined;
  if (code !== undefined && statusByCode[code] !== undefined) {
    return {
      code,
      message:
        safeMessages[code] ??
        (typeof coded.message === "string"
          ? coded.message
          : "The operation could not be completed."),
      ...(typeof (coded as { retryAfter?: unknown }).retryAfter === "number"
        ? { retryAfter: (coded as { retryAfter: number }).retryAfter }
        : {}),
      status: statusByCode[code],
    };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "The operation could not be completed.",
    status: HttpStatus.INTERNAL_SERVER_ERROR,
  };
}

export function apiHttpException(
  mapped: MappedApiError,
  requestId: string,
): HttpException {
  const exception = new HttpException(
    { code: mapped.code, message: mapped.message, requestId },
    mapped.status,
  );
  if (mapped.retryAfter !== undefined) {
    (exception as HttpException & { retryAfter: number }).retryAfter =
      mapped.retryAfter;
  }
  return exception;
}
