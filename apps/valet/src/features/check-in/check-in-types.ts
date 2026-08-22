import type {
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
  | "customer-phone"
  | "vehicle-condition"
  | "key-scan"
  | "key-assigned"
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

export interface CheckInState {
  readonly activeSession: CheckInActiveSession | null;
  readonly continuations: StaffCheckInContinuationSummary[];
  readonly drafts: StaffCheckInDraftSummary[];
  readonly error: string | null;
  readonly isHydrating: boolean;
  readonly isSubmitting: boolean;
  readonly pendingVehicle: CheckInVehicleData | null;
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
