import type {
  CompleteHandoffResponse,
  StaffPaymentProjectionResponse,
  StaffTaskQueueItem,
  StaffValetSessionDetailResponse,
  TaskQueueResponse,
} from "@valet/contracts";

import type {
  EmployeeOperationalFailure,
  EmployeeOperationalScope,
} from "./employee-operational-types";

export type EmployeeReleaseBlock = "authority" | "financial" | "verification";

export type EmployeeReleasePhase =
  | "ambiguous"
  | "blocked"
  | "conflict"
  | "inactive"
  | "loading"
  | "ready"
  | "reconciling"
  | "released"
  | "releasing"
  | "unavailable";

export interface EmployeeReleaseSnapshot {
  readonly block: EmployeeReleaseBlock | null;
  readonly completion: CompleteHandoffResponse | null;
  readonly failure: EmployeeOperationalFailure | null;
  readonly identityGeneration: number | null;
  readonly phase: EmployeeReleasePhase;
  readonly releaseRequiresPayment: boolean | null;
  readonly releaseSatisfied: boolean | null;
  readonly scope: EmployeeOperationalScope | null;
  readonly session: StaffValetSessionDetailResponse | null;
  readonly task: StaffTaskQueueItem | null;
}

export interface EmployeeReleaseTransport {
  complete(
    sessionId: string,
    version: number,
  ): Promise<CompleteHandoffResponse>;
  loadPayment(sessionId: string): Promise<StaffPaymentProjectionResponse>;
  loadSession(sessionId: string): Promise<StaffValetSessionDetailResponse>;
  loadTaskQueue(locationId: string): Promise<TaskQueueResponse>;
}

export interface EmployeeReleaseOptions {
  readonly onStateChange?:
    ((snapshot: EmployeeReleaseSnapshot) => void) | undefined;
  readonly transport: EmployeeReleaseTransport;
}
