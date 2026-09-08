import type {
  ParkingTaskQueueResponse,
  StaffTaskQueueItem,
  StaffValetSessionDetailResponse,
  StartParkingResponse,
  TaskQueueResponse,
} from "@valet/contracts";

import type {
  EmployeeOperationalFailure,
  EmployeeOperationalScope,
} from "./employee-operational-types";

export type EmployeeParkingStartPhase =
  | "accepted"
  | "ambiguous"
  | "assigned"
  | "conflict"
  | "inactive"
  | "loading"
  | "reconciling"
  | "started"
  | "submitting"
  | "unavailable";

export interface EmployeeParkingStartSnapshot {
  readonly failure: EmployeeOperationalFailure | null;
  readonly identityGeneration: number | null;
  readonly phase: EmployeeParkingStartPhase;
  readonly scope: EmployeeOperationalScope | null;
  readonly session: StaffValetSessionDetailResponse | null;
  readonly task: StaffTaskQueueItem | null;
}

export interface EmployeeParkingStartTransport {
  loadSession(sessionId: string): Promise<StaffValetSessionDetailResponse>;
  loadTaskQueue(locationId: string): Promise<TaskQueueResponse>;
  queueParkingTask(sessionId: string): Promise<ParkingTaskQueueResponse>;
  startParking(
    sessionId: string,
    expectedSessionVersion: number,
    expectedTaskVersion: number,
  ): Promise<StartParkingResponse>;
}

export interface EmployeeParkingStartOptions {
  readonly onStateChange?:
    ((snapshot: EmployeeParkingStartSnapshot) => void) | undefined;
  readonly transport: EmployeeParkingStartTransport;
}
