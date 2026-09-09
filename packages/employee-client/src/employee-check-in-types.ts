import type {
  CompleteCheckInRequest,
  CompleteCheckInResponse,
  ConditionCompletionResponse,
  ConditionNoteRequest,
  ConditionNoteResponse,
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
  | "vehicle-details"
  | "customer"
  | "submitting"
  | "intake-ambiguous"
  | "created"
  | "continuation";

export interface EmployeeCheckInVehicleDraft {
  readonly color?: string | null;
  readonly make?: string | null;
  readonly mode: "CONFIRMED_PLATE" | "TEMPORARY_DESCRIPTOR";
  readonly model?: string | null;
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
  readonly conditionCompletedAt: string | null;
  readonly sessionId: string;
  readonly state: "CHECKING_IN" | "AWAITING_PARKING";
  readonly vehicle: StaffValetSessionDetailResponse["vehicle"];
  readonly version: number;
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

export type EmployeeCheckInConditionSelection =
  "No visible issue" | "Existing damage" | "Needs review";

export type EmployeeCheckInConditionStage = "note" | "completion";

export type EmployeeCheckInContinuationMode =
  | "view"
  | "edit-details"
  | "edit-identity"
  | "confirm-identity"
  | "select-condition"
  | "submitting"
  | "reconciling"
  | "ambiguous"
  | "conflict"
  | "boundary"
  | "condition-completed";

export interface EmployeeCheckInContinuation {
  readonly conditionSelection: EmployeeCheckInConditionSelection | null;
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
  readonly pendingConditionSelection: EmployeeCheckInConditionSelection | null;
  readonly pendingConditionStage: EmployeeCheckInConditionStage | null;
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
  completeCheckIn(
    sessionId: string,
    input: CompleteCheckInRequest,
  ): Promise<CompleteCheckInResponse>;
  completeCondition(sessionId: string): Promise<ConditionCompletionResponse>;
  correctDetails(
    sessionId: string,
    input: VehicleDetailsCorrectionRequest,
  ): Promise<VehicleDetailsCorrectionResponse>;
  correctIdentity(
    sessionId: string,
    input: VehicleIdentityRequest,
  ): Promise<VehicleIdentityResponse>;
  createConditionNote(
    sessionId: string,
    input: ConditionNoteRequest,
  ): Promise<ConditionNoteResponse>;
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
