import type { VehicleIdentityInput } from "../vehicles/vehicle-identity-command";
import type { VehicleDetailsInput } from "../vehicles/vehicle-details-normalization";

export type IntakeSessionCommandErrorCode =
  | "ACTIVE_VALET_SESSION_CONFLICT"
  | "CUSTOMER_PHONE_AMBIGUOUS"
  | "IDEMPOTENCY_CONFLICT"
  | "INTAKE_CONCURRENCY_CONFLICT"
  | "INTAKE_INPUT_INVALID"
  | "RETURNING_CUSTOMER_INTENT_INVALID";

const errorMessages: Record<IntakeSessionCommandErrorCode, string> = {
  ACTIVE_VALET_SESSION_CONFLICT:
    "The vehicle already has an active valet session at this location.",
  CUSTOMER_PHONE_AMBIGUOUS:
    "The customer contact matches more than one customer.",
  IDEMPOTENCY_CONFLICT:
    "The intake operation identifier was already used for different input.",
  INTAKE_CONCURRENCY_CONFLICT:
    "The intake facts changed during the operation. Retry with current data.",
  INTAKE_INPUT_INVALID: "The intake session input is invalid.",
  RETURNING_CUSTOMER_INTENT_INVALID:
    "The saved customer suggestion is no longer available.",
};

export class IntakeSessionCommandError extends Error {
  readonly code: IntakeSessionCommandErrorCode;

  constructor(code: IntakeSessionCommandErrorCode) {
    super(errorMessages[code]);
    this.name = "IntakeSessionCommandError";
    this.code = code;
  }
}

export type IntakeCustomerInput =
  | {
      readonly customerId: string;
      readonly intent: "USE_SAVED_CUSTOMER";
    }
  | {
      readonly displayName?: string;
      readonly intent: "DIFFERENT_CUSTOMER";
      readonly phone: string;
    };

export interface IntakeSessionCommandRequest {
  readonly authenticatedUserId: string;
  readonly customer?: IntakeCustomerInput;
  readonly intakeOperationId: string;
  readonly targetLocationId: string;
  readonly vehicleDetails?: VehicleDetailsInput;
  readonly vehicleIdentity: VehicleIdentityInput;
}

export interface IntakeSessionCommandResult {
  readonly color: string | null;
  readonly createdAt: Date;
  readonly customerId: string | null;
  readonly locationId: string;
  readonly make: string | null;
  readonly model: string | null;
  readonly organizationId: string;
  readonly state: "CHECKING_IN";
  readonly valetSessionId: string;
  readonly vehicleId: string;
  readonly vehicleUpdatedAt: Date;
  readonly version: 1;
}

export interface IntakeSessionCommandOptions {
  readonly auditEventIdFactory?: () => string;
  readonly customerIdFactory?: () => string;
  readonly disabledGuestEntropyFactory?: () => Buffer;
  readonly sessionIdFactory?: () => string;
  readonly vehicleIdFactory?: () => string;
}
