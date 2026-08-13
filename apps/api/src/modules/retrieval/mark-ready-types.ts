export interface LockedMarkReadySession {
  readonly id: string;
  readonly key_slot_id: string | null;
  readonly location_id: string;
  readonly organization_id: string;
  readonly parking_spot_id: string | null;
  readonly parking_zone_id: string | null;
  readonly ready_at: Date | null;
  readonly retrieval_requested_at: Date | null;
  readonly retrieval_started_at: Date | null;
  readonly state: string;
  readonly version: number;
}

export interface LockedMarkReadyTask {
  readonly current_assignee_membership_id: string | null;
  readonly id: string;
  readonly location_id: string;
  readonly organization_id: string;
  readonly status: string;
  readonly valet_session_id: string;
  readonly version: number;
}

export interface LockedMarkReadyRequest {
  readonly id: string;
  readonly status: string;
}

export interface MarkReadyResult {
  readonly readyAt: string;
  readonly sessionId: string;
  readonly sessionVersion: number;
  readonly state: "READY";
  readonly taskId: string;
  readonly taskStatus: "IN_PROGRESS";
  readonly taskVersion: number;
}
