import type {
  AcceptTaskResponse,
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
  readonly taskId: string;
}

export interface EmployeeOperationalSnapshot {
  readonly contextFailure: EmployeeOperationalFailure | null;
  readonly identityGeneration: number | null;
  readonly mutation: EmployeeTaskMutationState;
  readonly phase: EmployeeOperationalPhase;
  readonly queueFailure: EmployeeOperationalFailure | null;
  readonly queueLoading: boolean;
  readonly scope: EmployeeOperationalScope | null;
  readonly tasks: readonly StaffTaskQueueItem[];
}

export interface EmployeeOperationalTransport {
  acceptTask(
    taskId: string,
    expectedVersion: number,
  ): Promise<AcceptTaskResponse>;
  loadOperationalContext(): Promise<StaffOperationalContextResponse>;
  loadTaskQueue(locationId: string): Promise<TaskQueueResponse>;
}

export interface EmployeeOperationalSessionOptions {
  readonly onStateChange?:
    ((snapshot: EmployeeOperationalSnapshot) => void) | undefined;
  readonly transport: EmployeeOperationalTransport;
}
