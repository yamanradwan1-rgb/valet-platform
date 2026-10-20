import { isExpectedDatabaseExhaustion } from "../database/runtime-database-deadline";
import {
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from "@nestjs/common";
import { mapPresenceApiError } from "./presence-api-errors";

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
  AUDIT_INVESTIGATION_SNAPSHOT_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  AUDIT_INVESTIGATION_TIMELINE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  CONDITION_PHOTO_NOT_FOUND: HttpStatus.NOT_FOUND,
  CONDITION_PHOTO_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
  CONDITION_PHOTO_INVALID_IMAGE: HttpStatus.UNPROCESSABLE_ENTITY,
  CONDITION_PHOTO_OPERATION_CONFLICT: HttpStatus.CONFLICT,
  CONDITION_PHOTO_LIMIT_REACHED: HttpStatus.CONFLICT,
  CONDITION_PHOTO_EXPIRED: HttpStatus.CONFLICT,
  CONDITION_PHOTO_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  CONDITION_PHOTO_STORAGE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  SHIFT_ALREADY_ENDED: HttpStatus.CONFLICT,
  ACTIVE_SHIFT_CONFLICT: HttpStatus.CONFLICT,
  ACTIVE_VALET_SESSION_CONFLICT: HttpStatus.CONFLICT,
  AUTHORIZATION_DENIED: HttpStatus.NOT_FOUND,
  COLLECTION_ALREADY_STARTED: HttpStatus.CONFLICT,
  CASH_ADJUSTMENT_NOT_ALLOWED: HttpStatus.CONFLICT,
  CASH_COLLECTION_NOT_ALLOWED: HttpStatus.CONFLICT,
  CASH_IDEMPOTENCY_CONFLICT: HttpStatus.CONFLICT,
  CHECK_IN_CONDITION_PHOTO_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  CHECK_IN_EVIDENCE_REQUEST_INVALID: HttpStatus.BAD_REQUEST,
  COMPANY_ANALYTICS_TOO_LARGE: HttpStatus.UNPROCESSABLE_ENTITY,
  CONFIGURATION_OVERRIDE_CONFLICT: HttpStatus.CONFLICT,
  CONFIGURATION_CONFLICT: HttpStatus.CONFLICT,
  CONFIGURATION_VALUE_INVALID: HttpStatus.BAD_REQUEST,
  CONDITION_CHECK_INCOMPLETE: HttpStatus.UNPROCESSABLE_ENTITY,
  REPORT_EXPORT_TOO_LARGE: HttpStatus.UNPROCESSABLE_ENTITY,
  CONDITION_NOTE_ALREADY_SUPERSEDED: HttpStatus.CONFLICT,
  CUSTOMER_PHONE_AMBIGUOUS: HttpStatus.CONFLICT,
  ANTI_ABUSE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  GUEST_ACCESS_INTENT_CONFLICT: HttpStatus.CONFLICT,
  GUEST_ACCESS_INVALID: HttpStatus.UNAUTHORIZED,
  GUEST_ACCESS_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  GUEST_ACCESS_REQUEST_INVALID: HttpStatus.BAD_REQUEST,
  GUEST_RATING_CONFLICT: HttpStatus.CONFLICT,
  GUEST_RATING_NOT_AVAILABLE: HttpStatus.CONFLICT,
  GUEST_PUSH_REGISTRATION_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
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
  INTAKE_CONCURRENCY_CONFLICT: HttpStatus.CONFLICT,
  INVALID_STATE_TRANSITION: HttpStatus.CONFLICT,
  KEY_SLOT_NOT_FOUND_OR_UNAVAILABLE: HttpStatus.CONFLICT,
  KEY_CUSTODY_NOT_READY: HttpStatus.CONFLICT,
  LOCATION_ACCESS_DENIED: HttpStatus.NOT_FOUND,
  LOCATION_CODE_CONFLICT: HttpStatus.CONFLICT,
  LOCATION_DRAIN_BLOCKED: HttpStatus.CONFLICT,
  LOCATION_INVALID_STATE: HttpStatus.CONFLICT,
  LOCATION_LIFECYCLE_CONFLICT: HttpStatus.CONFLICT,
  LOCATION_NOT_READY: HttpStatus.CONFLICT,
  MAP_SETUP_CONFLICT: HttpStatus.CONFLICT,
  MFA_ENROLLMENT_NOT_AVAILABLE: HttpStatus.CONFLICT,
  MFA_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  MFA_SECURITY_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  MFA_STEP_UP_REQUIRED: HttpStatus.FORBIDDEN,
  MFA_VERIFICATION_FAILED: HttpStatus.FORBIDDEN,
  DIGITAL_PAYMENT_PROVIDER_UNAVAILABLE: HttpStatus.CONFLICT,
  FINANCIAL_RELEASE_NOT_SATISFIED: HttpStatus.CONFLICT,
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
  PARKING_ZONE_INVALID: HttpStatus.CONFLICT,
  RESOURCE_CODE_CONFLICT: HttpStatus.CONFLICT,
  RETRIEVAL_REQUEST_NOT_READY: HttpStatus.CONFLICT,
  REQUEST_INVALID: HttpStatus.BAD_REQUEST,
  STAFF_ACTIVATION_FAILED: HttpStatus.UNAUTHORIZED,
  STAFF_ACTIVATION_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  STAFF_AUTHENTICATION_FAILED: HttpStatus.UNAUTHORIZED,
  TASK_ASSIGNEE_NOT_ELIGIBLE: HttpStatus.CONFLICT,
  TASK_ASSIGNMENT_CONFLICT: HttpStatus.CONFLICT,
  TASK_INVALID_STATE: HttpStatus.CONFLICT,
  TASK_NOT_FOUND_OR_FORBIDDEN: HttpStatus.NOT_FOUND,
  TASK_REASSIGN_REASON_REQUIRED: HttpStatus.BAD_REQUEST,
  STAFF_AUTHENTICATION_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  STAFF_AUTH_ORIGIN_NOT_ALLOWED: HttpStatus.FORBIDDEN,
  STAFF_ONBOARDING_UNAVAILABLE: HttpStatus.CONFLICT,
  STAFF_ONBOARDING_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  STAFF_ACCESS_INVALID_STATE: HttpStatus.CONFLICT,
  STAFF_HANDOVER_REQUIRED: HttpStatus.CONFLICT,
  LAST_USABLE_ADMIN_REQUIRED: HttpStatus.CONFLICT,
  STAFF_PUSH_REGISTRATION_CONFLICT: HttpStatus.CONFLICT,
  STAFF_PUSH_REGISTRATION_NOT_AVAILABLE: HttpStatus.NOT_FOUND,
  PHOTO_REQUIREMENT_NOT_SATISFIED: HttpStatus.UNPROCESSABLE_ENTITY,
  PHOTO_STORAGE_OBJECT_CONFLICT: HttpStatus.CONFLICT,
  TENANT_ACCESS_DENIED: HttpStatus.NOT_FOUND,
  RETURNING_CUSTOMER_INTENT_INVALID: HttpStatus.CONFLICT,
  VEHICLE_DETAILS_INVALID: HttpStatus.BAD_REQUEST,
  VEHICLE_DETAILS_SESSION_NOT_MUTABLE: HttpStatus.CONFLICT,
  VEHICLE_DETAILS_VERSION_CONFLICT: HttpStatus.CONFLICT,
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
  AUDIT_INVESTIGATION_SNAPSHOT_UNAVAILABLE: "Investigation history is temporarily unavailable.",
  AUDIT_INVESTIGATION_TIMELINE_UNAVAILABLE: "Investigation history is temporarily unavailable.",
  CONDITION_PHOTO_NOT_FOUND: "The requested photo operation is not available.",
  CONDITION_PHOTO_TOO_LARGE: "The image exceeds the allowed size.",
  CONDITION_PHOTO_INVALID_IMAGE: "The image could not be verified.",
  CONDITION_PHOTO_OPERATION_CONFLICT: "The upload operation conflicts with a prior request.",
  CONDITION_PHOTO_LIMIT_REACHED: "The photo limit for this session has been reached.",
  CONDITION_PHOTO_EXPIRED: "The upload operation has expired.",
  CONDITION_PHOTO_RATE_LIMITED: "Too many photo requests. Try again later.",
  CONDITION_PHOTO_STORAGE_UNAVAILABLE: "Photo storage is temporarily unavailable.",
  SHIFT_ALREADY_ENDED: "The Shift has already ended.",
  ANTI_ABUSE_UNAVAILABLE: "Service temporarily unavailable.",
  AUTHORIZATION_DENIED: "The requested resource is not available.",
  GUEST_ACCESS_INVALID: "Guest access is invalid.",
  GUEST_ACCESS_RATE_LIMITED: "Too many requests. Try again later.",
  GUEST_RATING_CONFLICT:
    "A different rating is already recorded for this visit.",
  GUEST_RATING_NOT_AVAILABLE:
    "Guest rating is available only after the visit is completed.",
  GUEST_PUSH_REGISTRATION_UNAVAILABLE: "Guest notifications are temporarily unavailable.",
  FINANCIAL_RELEASE_NOT_SATISFIED:
    "The financial release requirement is not satisfied.",
  HANDOFF_SECURITY_UNAVAILABLE: "Service temporarily unavailable.",
  HANDOFF_VERIFICATION_FAILED: "Handoff verification failed.",
  HANDOFF_VERIFICATION_RATE_LIMITED: "Too many requests. Try again later.",
  LOCATION_ACCESS_DENIED: "The requested resource is not available.",
  MFA_ENROLLMENT_NOT_AVAILABLE: "MFA enrollment is not available.",
  MFA_RATE_LIMITED: "Too many requests. Try again later.",
  MFA_SECURITY_UNAVAILABLE: "Service temporarily unavailable.",
  MFA_STEP_UP_REQUIRED: "Additional authentication is required.",
  MFA_VERIFICATION_FAILED: "MFA verification failed.",
  PARKING_ZONE_INVALID: "The selected Parking Zone is not available.",
  RESOURCE_CODE_CONFLICT:
    "A resource with this code already exists in this Location.",
  STAFF_ACTIVATION_FAILED: "Staff activation failed.",
  STAFF_ACTIVATION_RATE_LIMITED: "Too many requests. Try again later.",
  STAFF_AUTHENTICATION_FAILED: "Staff authentication failed.",
  STAFF_AUTHENTICATION_RATE_LIMITED: "Too many requests. Try again later.",
  STAFF_AUTH_ORIGIN_NOT_ALLOWED: "The request origin is not allowed.",
  STAFF_ONBOARDING_UNAVAILABLE: "Staff onboarding is not available.",
  STAFF_ONBOARDING_RATE_LIMITED: "Too many requests. Try again later.",
  STAFF_ACCESS_INVALID_STATE:
    "The requested Staff access change is not valid now.",
  STAFF_HANDOVER_REQUIRED:
    "Operational handover is required before this change.",
  LAST_USABLE_ADMIN_REQUIRED: "Another usable Company Admin is required.",
  STAFF_PUSH_REGISTRATION_CONFLICT:
    "The push registration could not be reconciled.",
  STAFF_PUSH_REGISTRATION_NOT_AVAILABLE:
    "The push registration is not available.",
  TENANT_ACCESS_DENIED: "The requested resource is not available.",
};

export function mapApiError(error: unknown, guest = false): MappedApiError {
  if (isExpectedDatabaseExhaustion(error)) {
    return {
      code: guest ? "ANTI_ABUSE_UNAVAILABLE" : "INTERNAL_ERROR",
      message: "Service temporarily unavailable.",
      status: HttpStatus.SERVICE_UNAVAILABLE,
    };
  }
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
  const presenceError = mapPresenceApiError(code);
  if (presenceError !== undefined) {
    const retryAfter = (coded as { retryAfter?: unknown }).retryAfter;
    return {
      ...presenceError,
      ...(presenceError.status === HttpStatus.TOO_MANY_REQUESTS &&
      typeof retryAfter === "number"
        ? { retryAfter }
        : {}),
    };
  }
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
