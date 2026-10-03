import type {
  ConfirmParkedResponse,
  ParkingSpotValidationQuery,
  ParkingSpotValidationResponse,
  StaffTaskQueueItem,
  StaffValetSessionDetailResponse,
  TaskQueueResponse,
} from "@valet/contracts";

import type {
  EmployeeOperationalFailure,
  EmployeeOperationalScope,
} from "./employee-operational-types";

export type EmployeeConfirmParkedPhase =
  | "ambiguous"
  | "inactive"
  | "loading"
  | "parked"
  | "ready"
  | "reconciling"
  | "slot"
  | "spot"
  | "submitting"
  | "unavailable";

export type EmployeeConfirmParkedConflict =
  "authority" | "inconsistent" | "slot" | "spot" | "stale";

export type EmployeeConfirmParkedSuccess =
  | {
      readonly keySlotCode: string;
      readonly response: ConfirmParkedResponse;
      readonly source: "command";
    }
  | {
      readonly keySlotCode: string;
      readonly parkedAt: string;
      readonly parkingSpotCode: string;
      readonly sessionVersion: number;
      readonly source: "reconciliation";
    };

export interface EmployeeConfirmParkedSnapshot {
  readonly conflict: EmployeeConfirmParkedConflict | null;
  readonly failure: EmployeeOperationalFailure | null;
  readonly identityGeneration: number | null;
  readonly keySlotCandidate: string;
  readonly keySlotResourceId: string | null;
  readonly parked: EmployeeConfirmParkedSuccess | null;
  readonly parkingSpotCandidate: string;
  readonly parkingSpotResourceId: string | null;
  readonly parkingSpotValidation: ParkingSpotValidationResponse | null;
  readonly parkingSpotValidationPending: boolean;
  readonly phase: EmployeeConfirmParkedPhase;
  readonly scope: EmployeeOperationalScope | null;
  readonly session: StaffValetSessionDetailResponse | null;
  readonly task: StaffTaskQueueItem | null;
}

export interface EmployeeConfirmParkedTransport {
  validateParkingSpot(
    sessionId: string,
    input: ParkingSpotValidationQuery,
  ): Promise<ParkingSpotValidationResponse>;
  confirmParked(
    sessionId: string,
    input: {
      readonly expectedSessionVersion: number;
      readonly expectedTaskVersion: number;
      readonly keySlotCode: string;
      readonly keySlotId?: string;
      readonly parkingSpotCode: string;
      readonly parkingSpotId?: string;
    },
  ): Promise<ConfirmParkedResponse>;
  loadSession(sessionId: string): Promise<StaffValetSessionDetailResponse>;
  loadTaskQueue(locationId: string): Promise<TaskQueueResponse>;
}

export interface EmployeeConfirmParkedOptions {
  readonly onStateChange?:
    ((snapshot: EmployeeConfirmParkedSnapshot) => void) | undefined;
  readonly transport: EmployeeConfirmParkedTransport;
}
