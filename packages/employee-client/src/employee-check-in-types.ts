import type {
  IntakeRequest,
  IntakeResponse,
  ReturningVehicleRecognitionRequest,
  ReturningVehicleRecognitionResponse,
  StaffCheckInContinuationSummary,
  StaffCheckInDraftSummary,
  StaffValetSessionDetailResponse,
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

export interface EmployeeCheckInSnapshot {
  readonly active: EmployeeCheckInAuthoritativeSession | null;
  readonly customerPhone: string;
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
