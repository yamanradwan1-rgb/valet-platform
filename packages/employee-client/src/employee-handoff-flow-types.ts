import type {
  AbortHandoffResponse,
  InitiateHandoffResponse,
  StaffTaskQueueItem,
  StaffValetSessionDetailResponse,
  TaskQueueResponse,
  VerifiedHandoffResponse,
} from "@valet/contracts";

import type {
  EmployeeOperationalFailure,
  EmployeeOperationalScope,
} from "./employee-operational-types";

export type EmployeeHandoffPhase =
  | "aborting"
  | "ambiguous"
  | "conflict"
  | "inactive"
  | "initiating"
  | "loading"
  | "overriding"
  | "pending"
  | "ready"
  | "reconciling"
  | "unavailable"
  | "verified"
  | "verifying";

export interface EmployeeHandoffSnapshot {
  readonly failure: EmployeeOperationalFailure | null;
  readonly identityGeneration: number | null;
  readonly phase: EmployeeHandoffPhase;
  readonly scope: EmployeeOperationalScope | null;
  readonly session: StaffValetSessionDetailResponse | null;
  readonly task: StaffTaskQueueItem | null;
}

export interface EmployeeHandoffTransport {
  abort(
    sessionId: string,
    version: number,
    reason: string,
  ): Promise<AbortHandoffResponse>;
  initiate(
    sessionId: string,
    version: number,
  ): Promise<InitiateHandoffResponse>;
  loadSession(sessionId: string): Promise<StaffValetSessionDetailResponse>;
  loadTaskQueue(locationId: string): Promise<TaskQueueResponse>;
  override(
    sessionId: string,
    version: number,
    reason: string,
  ): Promise<VerifiedHandoffResponse>;
  verifyDynamicQr(
    sessionId: string,
    version: number,
    proof: string,
  ): Promise<VerifiedHandoffResponse>;
  verifyPickupCode(
    sessionId: string,
    version: number,
    proof: string,
  ): Promise<VerifiedHandoffResponse>;
}

export interface EmployeeHandoffOptions {
  readonly onStateChange?:
    ((snapshot: EmployeeHandoffSnapshot) => void) | undefined;
  readonly transport: EmployeeHandoffTransport;
}
