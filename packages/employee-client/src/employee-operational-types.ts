import type {
  AcceptTaskResponse,
  AssignTaskResponse,
  StaffTaskQueueItem,
  TaskQueueResponse,
} from "@valet/contracts";
import type {
  StaffOperationalContextResponse,
  StaffOperationalRole,
} from "@valet/contracts/staff-context";

export interface EmployeeOperationalScope {
  readonly locationCode: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly role: StaffOperationalRole;
  readonly shiftId: string;
  readonly shiftStartedAt: string;
}

export type EmployeeOperationalPhase =
  | "access-denied"
  | "ambiguous-active-shifts"
  | "error"
  | "inactive"
  | "loading-context"
  | "no-active-shift"
  | "no-usable-location"
  | "ready";

export type EmployeeTaskMutationPhase =
  | "accepted"
  | "conflict"
  | "failed"
  | "idle"
  | "reconciling"
  | "recovery-unavailable"
  | "retry-available"
  | "submitting";

export interface EmployeeOperationalFailure {
  readonly code: string;
  readonly message: string;
  readonly retryAfter?: number | undefined;
  readonly status?: number | undefined;
}

export interface EmployeeTaskMutationState {
  readonly expectedVersion?: number | undefined;
  readonly failure?: EmployeeOperationalFailure | undefined;
  readonly phase: EmployeeTaskMutationPhase;
  readonly taskId?: string | undefined;
}

export interface EmployeeAcceptAttempt {
  readonly assigneeMembershipId: string;
  readonly expectedVersion: number;
  readonly generation: number;
  readonly kind: "accept" | "claim-and-accept";
  readonly locationId: string;
  readonly shiftId: string;
  readonly taskId: string;
}

export interface EmployeeOperationalSnapshot {
  /** Display-only count from the latest authoritative context response. */
  readonly activeShiftCount: number | null;
  readonly contextFailure: EmployeeOperationalFailure | null;
  readonly identityGeneration: number | null;
  readonly mutation: EmployeeTaskMutationState;
  readonly phase: EmployeeOperationalPhase;
  readonly queueFailure: EmployeeOperationalFailure | null;
  readonly queueHardStopped: boolean;
  readonly queueLoading: boolean;
  readonly queueRefreshing: boolean;
  readonly successfulQueueSnapshotCount: number;
  readonly scope: EmployeeOperationalScope | null;
  readonly tasks: readonly StaffTaskQueueItem[];
}

export interface EmployeeOperationalTransport {
  acceptTask(
    taskId: string,
    expectedVersion: number,
  ): Promise<AcceptTaskResponse>;
  assignTask(
    taskId: string,
    expectedVersion: number,
  ): Promise<AssignTaskResponse>;
  loadOperationalContext(): Promise<StaffOperationalContextResponse>;
  loadTaskQueue(
    locationId: string,
    signal?: AbortSignal,
  ): Promise<TaskQueueResponse>;
}

export interface EmployeeOperationalSessionOptions {
  readonly initialForeground?: boolean | undefined;
  readonly onStateChange?:
    ((snapshot: EmployeeOperationalSnapshot) => void) | undefined;
  readonly pollingIntervalMs?: number | undefined;
  readonly transport: EmployeeOperationalTransport;
}
