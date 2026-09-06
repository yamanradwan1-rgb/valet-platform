import type {
  IntakeRequest,
  IntakeResponse,
  ReturningVehicleRecognitionRequest,
  ReturningVehicleRecognitionResponse,
  StaffCheckInContinuationSummary,
  StaffCheckInDraftSummary,
  StaffValetSessionDetailResponse,
  VehicleDetailsCorrectionRequest,
  VehicleDetailsCorrectionResponse,
  VehicleIdentityRequest,
  VehicleIdentityResponse,
} from "@valet/contracts";

import type { EmployeeOperationalFailure } from "./employee-operational-types";

export type EmployeeCheckInPhase =
  | "inactive"
  | "discovering"
  | "discovery-error"
  | "recoverables"
  | "capture"
  | "confirm"
  | "recognizing"
  | "returning"
  | "customer"
  | "submitting"
  | "intake-ambiguous"
  | "created"
  | "continuation";

export interface EmployeeCheckInVehicleDraft {
  readonly mode: "CONFIRMED_PLATE" | "TEMPORARY_DESCRIPTOR";
  readonly plateCountry: string;
  readonly plateNumberRaw: string;
  readonly temporaryDescriptor: string;
}

export type EmployeeCheckInRecognizedVehicle = NonNullable<
  ReturningVehicleRecognitionResponse["vehicle"]
>;

export type EmployeeCheckInRecoverable =
  | {
      readonly kind: "DRAFT";
      readonly value: StaffCheckInDraftSummary;
    }
  | {
      readonly kind: "CONTINUATION";
      readonly value: StaffCheckInContinuationSummary;
    };

export interface EmployeeCheckInAuthoritativeSession {
  readonly sessionId: string;
  readonly state: "CHECKING_IN" | "AWAITING_PARKING";
  readonly vehicle: StaffValetSessionDetailResponse["vehicle"];
}

export type EmployeeCheckInCorrectionIntent =
  | {
      readonly kind: "DETAILS";
      readonly request: VehicleDetailsCorrectionRequest;
    }
  | {
      readonly kind: "IDENTITY";
      readonly request: VehicleIdentityRequest;
    };

export type EmployeeCheckInContinuationMode =
  | "view"
  | "edit-details"
  | "edit-identity"
  | "confirm-identity"
  | "submitting"
  | "reconciling"
  | "ambiguous"
  | "conflict"
  | "boundary";

export interface EmployeeCheckInContinuation {
  readonly detailsDraft: {
    readonly color: string;
    readonly make: string;
    readonly model: string;
  };
  readonly identityDraft: EmployeeCheckInVehicleDraft;
  readonly lastMutationKind:
    | "DETAILS_NO_CHANGE"
    | "DETAILS_UPDATED"
    | "IDENTITY_UPDATED"
    | "RECONCILED"
    | null;
  readonly mode: EmployeeCheckInContinuationMode;
  readonly pendingIntent: EmployeeCheckInCorrectionIntent | null;
}

export interface EmployeeCheckInSnapshot {
  readonly active: EmployeeCheckInAuthoritativeSession | null;
  readonly customerPhone: string;
  readonly continuation: EmployeeCheckInContinuation;
  readonly error: EmployeeOperationalFailure | null;
  readonly identityGeneration: number | null;
  readonly locationId: string | null;
  readonly phase: EmployeeCheckInPhase;
  readonly recognizedVehicle: EmployeeCheckInRecognizedVehicle | null;
  readonly recoverables: readonly EmployeeCheckInRecoverable[];
  readonly recoveryChecked: boolean;
  readonly vehicle: EmployeeCheckInVehicleDraft;
}

export interface EmployeeCheckInTransport {
  correctDetails(
    sessionId: string,
    input: VehicleDetailsCorrectionRequest,
  ): Promise<VehicleDetailsCorrectionResponse>;
  correctIdentity(
    sessionId: string,
    input: VehicleIdentityRequest,
  ): Promise<VehicleIdentityResponse>;
  createIntake(input: IntakeRequest): Promise<IntakeResponse>;
  loadContinuations(locationId: string): Promise<{
    readonly continuations: StaffCheckInContinuationSummary[];
  }>;
  loadDrafts(locationId: string): Promise<{
    readonly drafts: StaffCheckInDraftSummary[];
  }>;
  loadSession(sessionId: string): Promise<StaffValetSessionDetailResponse>;
  recognize(
    input: ReturningVehicleRecognitionRequest,
  ): Promise<ReturningVehicleRecognitionResponse>;
}

export interface EmployeeCheckInSessionOptions {
  readonly createOperationId: () => string;
  readonly transport: EmployeeCheckInTransport;
}
