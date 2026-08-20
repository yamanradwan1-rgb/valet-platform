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
  COLLECTION_ALREADY_STARTED: HttpStatus.CONFLICT,
  CASH_ADJUSTMENT_NOT_ALLOWED: HttpStatus.CONFLICT,
  CASH_COLLECTION_NOT_ALLOWED: HttpStatus.CONFLICT,
  CASH_IDEMPOTENCY_CONFLICT: HttpStatus.CONFLICT,
  CHECK_IN_CONDITION_PHOTO_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  CHECK_IN_EVIDENCE_REQUEST_INVALID: HttpStatus.BAD_REQUEST,
  CONDITION_CHECK_INCOMPLETE: HttpStatus.UNPROCESSABLE_ENTITY,
  CONDITION_NOTE_ALREADY_SUPERSEDED: HttpStatus.CONFLICT,
  ANTI_ABUSE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  GUEST_ACCESS_INTENT_CONFLICT: HttpStatus.CONFLICT,
  GUEST_ACCESS_INVALID: HttpStatus.UNAUTHORIZED,
  GUEST_ACCESS_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  GUEST_ACCESS_REQUEST_INVALID: HttpStatus.BAD_REQUEST,
  GPS_SAMPLE_IDEMPOTENCY_CONFLICT: HttpStatus.CONFLICT,
  HANDOFF_ABORT_REASON_REQUIRED: HttpStatus.BAD_REQUEST,
  HANDOFF_METHOD_NOT_ALLOWED: HttpStatus.CONFLICT,
  HANDOFF_OVERRIDE_NOT_ALLOWED: HttpStatus.FORBIDDEN,
  HANDOFF_OVERRIDE_REASON_REQUIRED: HttpStatus.BAD_REQUEST,
  HANDOFF_SECURITY_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  HANDOFF_VERIFICATION_ALREADY_ISSUED: HttpStatus.CONFLICT,
  HANDOFF_VERIFICATION_ALREADY_VERIFIED: HttpStatus.CONFLICT,
  HANDOFF_VERIFICATION_FAILED: HttpStatus.CONFLICT,
  HANDOFF_VERIFICATION_NOT_ACTIVE: HttpStatus.CONFLICT,
  HANDOFF_VERIFICATION_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  IDEMPOTENCY_CONFLICT: HttpStatus.CONFLICT,
  INTAKE_INPUT_INVALID: HttpStatus.BAD_REQUEST,
  INVALID_STATE_TRANSITION: HttpStatus.CONFLICT,
  KEY_SLOT_NOT_FOUND_OR_UNAVAILABLE: HttpStatus.CONFLICT,
  KEY_CUSTODY_NOT_READY: HttpStatus.CONFLICT,
  LOCATION_ACCESS_DENIED: HttpStatus.NOT_FOUND,
  MAP_SETUP_CONFLICT: HttpStatus.CONFLICT,
  DIGITAL_PAYMENT_PROVIDER_UNAVAILABLE: HttpStatus.CONFLICT,
  PAYMENT_AMOUNT_INVALID: HttpStatus.BAD_REQUEST,
  PAYMENT_NOT_AVAILABLE: HttpStatus.CONFLICT,
  PAYMENT_TIPS_DISABLED: HttpStatus.CONFLICT,
  PAYMENT_VALIDATION_DISABLED: HttpStatus.CONFLICT,
  PAYMENT_VALIDATION_INVALID: HttpStatus.CONFLICT,
  PAYMENT_VALIDATION_NOT_ALLOWED: HttpStatus.CONFLICT,
  PRECOLLECTION_CORRECTION_NOT_ALLOWED: HttpStatus.CONFLICT,
  REFUND_AMOUNT_INVALID: HttpStatus.BAD_REQUEST,
  REFUND_IDEMPOTENCY_CONFLICT: HttpStatus.CONFLICT,
  REFUND_NOT_ALLOWED: HttpStatus.CONFLICT,
  OPEN_TASK_HANDOFF_REQUIRED: HttpStatus.CONFLICT,
  SHIFT_CASH_REPORT_INVALID: HttpStatus.BAD_REQUEST,
  SHIFT_CASH_RECONCILIATION_UNAVAILABLE: HttpStatus.CONFLICT,
  PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE: HttpStatus.CONFLICT,
  RETRIEVAL_REQUEST_NOT_READY: HttpStatus.CONFLICT,
  REQUEST_INVALID: HttpStatus.BAD_REQUEST,
  STAFF_AUTHENTICATION_FAILED: HttpStatus.UNAUTHORIZED,
  TASK_ASSIGNEE_NOT_ELIGIBLE: HttpStatus.CONFLICT,
  TASK_ASSIGNMENT_CONFLICT: HttpStatus.CONFLICT,
  TASK_INVALID_STATE: HttpStatus.CONFLICT,
  TASK_NOT_FOUND_OR_FORBIDDEN: HttpStatus.NOT_FOUND,
  TASK_REASSIGN_REASON_REQUIRED: HttpStatus.BAD_REQUEST,
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
  HANDOFF_SECURITY_UNAVAILABLE: "Service temporarily unavailable.",
  HANDOFF_VERIFICATION_FAILED: "Handoff verification failed.",
  HANDOFF_VERIFICATION_RATE_LIMITED: "Too many requests. Try again later.",
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
