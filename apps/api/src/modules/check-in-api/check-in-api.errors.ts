import {
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from "@nestjs/common";

export class CheckInTransportValidationError extends Error {
  constructor() {
    super("The request is invalid.");
    this.name = "CheckInTransportValidationError";
  }
}

interface CodedError {
  readonly code?: unknown;
  readonly message?: unknown;
}

export interface MappedApiError {
  readonly code: string;
  readonly message: string;
  readonly status: number;
}

const statusByCode: Readonly<Record<string, number>> = {
  ACTIVE_VALET_SESSION_CONFLICT: HttpStatus.CONFLICT,
  AUTHORIZATION_DENIED: HttpStatus.NOT_FOUND,
  CHECK_IN_CONDITION_PHOTO_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  CHECK_IN_EVIDENCE_REQUEST_INVALID: HttpStatus.BAD_REQUEST,
  CONDITION_CHECK_INCOMPLETE: HttpStatus.UNPROCESSABLE_ENTITY,
  CONDITION_NOTE_ALREADY_SUPERSEDED: HttpStatus.CONFLICT,
  GUEST_ACCESS_INTENT_CONFLICT: HttpStatus.CONFLICT,
  GUEST_ACCESS_INVALID: HttpStatus.UNAUTHORIZED,
  GUEST_ACCESS_REQUEST_INVALID: HttpStatus.BAD_REQUEST,
  IDEMPOTENCY_CONFLICT: HttpStatus.CONFLICT,
  INTAKE_INPUT_INVALID: HttpStatus.BAD_REQUEST,
  INVALID_STATE_TRANSITION: HttpStatus.CONFLICT,
  LOCATION_ACCESS_DENIED: HttpStatus.NOT_FOUND,
  PHOTO_REQUIREMENT_NOT_SATISFIED: HttpStatus.UNPROCESSABLE_ENTITY,
  PHOTO_STORAGE_OBJECT_CONFLICT: HttpStatus.CONFLICT,
  TENANT_ACCESS_DENIED: HttpStatus.NOT_FOUND,
  VEHICLE_IDENTITY_CONFIRMATION_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  VEHICLE_IDENTITY_CONFLICT: HttpStatus.CONFLICT,
  VEHICLE_IDENTITY_INCOMPLETE: HttpStatus.UNPROCESSABLE_ENTITY,
  VEHICLE_IDENTITY_INVALID: HttpStatus.BAD_REQUEST,
  VEHICLE_IDENTITY_VERSION_CONFLICT: HttpStatus.CONFLICT,
  VERSION_CONFLICT: HttpStatus.CONFLICT,
};

const safeMessages: Readonly<Record<string, string>> = {
  AUTHORIZATION_DENIED: "The requested resource is not available.",
  GUEST_ACCESS_INVALID: "Guest access is invalid.",
  LOCATION_ACCESS_DENIED: "The requested resource is not available.",
  TENANT_ACCESS_DENIED: "The requested resource is not available.",
};

export function mapCheckInError(error: unknown): MappedApiError {
  if (error instanceof CheckInTransportValidationError) {
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
  return new HttpException(
    { code: mapped.code, message: mapped.message, requestId },
    mapped.status,
  );
}
