import type {
  ReturningVehicleRecognitionResponse,
  StaffCheckInContinuationSummary,
  StaffCheckInDraftSummary,
} from "@valet/contracts";

export type CheckInFlowStep =
  | "discovery"
  | "discovery-error"
  | "hydration-error"
  | "plate-scan"
  | "manual-plate"
  | "plate-confirm"
  | "returning-vehicle"
  | "vehicle-details"
  | "customer-phone"
  | "vehicle-condition"
  | "parking-task"
  | "multiple-recoverable";

export interface CheckInVehicleData {
  readonly color: string | null;
  readonly make: string | null;
  readonly model: string | null;
  readonly plateCountry: string;
  readonly plateNumberRaw: string;
  readonly temporaryDescriptor: string | null;
}

export interface CheckInActiveSession {
  readonly conditionCompletedAt: string | null;
  readonly customerPhone: string | null;
  readonly keySlotCode: string | null;
  readonly locationId: string;
  readonly parkingTaskId: string | null;
  readonly parkingTaskVersion: number | null;
  readonly sessionId: string;
  readonly sessionVersion: number;
  readonly state: "CHECKING_IN" | "AWAITING_PARKING";
  readonly vehicle: CheckInVehicleData;
  readonly vehicleUpdatedAt: string | null;
}

export type RecognizedCheckInVehicle = NonNullable<
  ReturningVehicleRecognitionResponse["vehicle"]
>;

export interface CheckInVehicleDetailsDraft {
  readonly color: string | null;
  readonly make: string | null;
  readonly model: string | null;
}

export type CheckInCustomerOrigin =
  "plate-confirm" | "returning-vehicle" | "vehicle-details";

export interface CheckInState {
  readonly activeSession: CheckInActiveSession | null;
  readonly continuations: StaffCheckInContinuationSummary[];
  readonly drafts: StaffCheckInDraftSummary[];
  readonly error: string | null;
  readonly correctionConflict: boolean;
  readonly customerOrigin: CheckInCustomerOrigin;
  readonly customerResolved: boolean;
  readonly isHydrating: boolean;
  readonly isSubmitting: boolean;
  readonly pendingCorrection: CheckInVehicleDetailsDraft | null;
  readonly pendingCorrectionExpectedAt: string | null;
  readonly pendingVehicle: CheckInVehicleData | null;
  readonly recognizedVehicle: RecognizedCheckInVehicle | null;
  readonly recognitionFailed: boolean;
  readonly step: CheckInFlowStep;
}

export interface StartParkingPayload {
  readonly keySlotCode: string | null;
  readonly locationId: string;
  readonly parkingStartedAt: string;
  readonly sessionId: string;
  readonly sessionVersion: number;
  readonly taskId: string;
  readonly taskVersion: number;
  readonly vehicle: CheckInVehicleData;
}
