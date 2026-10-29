import type { StaffSessionContext } from "../auth/staff-session-context";
import type { LockedTaskRow } from "./dispatch-types";

export interface EmergencyTakeoverCommandRequest {
  readonly taskId: string;
  readonly staffSessionContext: StaffSessionContext;
  readonly operationId: string;
  readonly expectedVersion: number;
  readonly targetAssigneeMembershipId: string;
  readonly reason: string;
}

export interface EmergencyTakeoverCommandResult {
  readonly operationId: string;
  readonly replayed: boolean;
  readonly task: {
    readonly id: string;
    readonly status: "IN_PROGRESS";
    readonly version: number;
    readonly assigneeMembershipId: string;
  };
  readonly sessionVersion: number;
}

export interface LockedEmergencySession {
  readonly id: string;
  readonly organization_id: string;
  readonly location_id: string;
  readonly state: string;
  readonly version: number;
}

export type LockedEmergencyTask = LockedTaskRow & {
  readonly status: "IN_PROGRESS";
  readonly current_assignee_membership_id: string;
};

export interface EmergencyTakeoverActor {
  readonly membershipId: string;
  readonly role: "VALET_SUPERVISOR" | "ORG_ADMIN";
}

export interface EmergencyTakeoverReceipt {
  readonly organization_id: string;
  readonly operation_id: string;
  readonly task_id: string;
  readonly actor_membership_id: string;
  readonly previous_assignee_membership_id: string;
  readonly new_assignee_membership_id: string;
  readonly expected_task_version: number;
  readonly result_task_version: number;
  readonly expected_session_version: number;
  readonly result_session_version: number;
  readonly request_fingerprint: string;
}

export interface EmergencyTrackingTransition {
  readonly endedOldTrackingSessionId: string | null;
  readonly newTrackingSessionId: string | null;
}
