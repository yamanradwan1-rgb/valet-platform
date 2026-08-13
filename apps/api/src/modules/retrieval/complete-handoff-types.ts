export interface LockedCompleteHandoffSession {
  readonly handoff_pending_at: Date | null;
  readonly id: string;
  readonly key_slot_id: string | null;
  readonly location_id: string;
  readonly organization_id: string;
  readonly ready_at: Date | null;
  readonly retrieval_requested_at: Date | null;
  readonly retrieval_started_at: Date | null;
  readonly state: string;
  readonly version: number;
}

export interface LockedCompleteHandoffTask {
  readonly created_at: Date;
  readonly current_assignee_membership_id: string | null;
  readonly id: string;
  readonly location_id: string;
  readonly organization_id: string;
  readonly status: string;
  readonly valet_session_id: string;
  readonly version: number;
}

export interface LockedCompleteHandoffRequest {
  readonly id: string;
  readonly status: string;
}

export interface LockedReleaseCustody {
  readonly event_type: string;
  readonly key_slot_id: string | null;
}

export interface CompleteHandoffResult {
  readonly retrievalRequestStatus: "COMPLETED";
  readonly sessionId: string;
  readonly sessionVersion: number;
  readonly state: "COMPLETED";
  readonly taskId: string;
  readonly taskStatus: "COMPLETED";
  readonly taskVersion: number;
}
