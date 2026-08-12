export interface LockedStartParkingSession {
  readonly id: string;
  readonly key_slot_id: string | null;
  readonly location_id: string;
  readonly organization_id: string;
  readonly parking_started_at: Date | null;
  readonly state: string;
  readonly version: number;
}

export interface LockedStartParkingTask {
  readonly current_assignee_membership_id: string | null;
  readonly id: string;
  readonly location_id: string;
  readonly organization_id: string;
  readonly status: string;
  readonly task_type: string;
  readonly valet_session_id: string;
  readonly version: number;
}

export interface StartParkingResult {
  readonly parkingStartedAt: string;
  readonly sessionId: string;
  readonly sessionVersion: number;
  readonly state: "PARKING";
  readonly taskId: string;
  readonly taskStatus: "IN_PROGRESS";
  readonly taskVersion: number;
}
