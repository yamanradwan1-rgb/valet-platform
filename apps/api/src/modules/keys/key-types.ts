export interface KeyAssignmentResult {
  readonly keySlotCode: string | null;
  readonly sessionId: string;
  readonly state: "AWAITING_PARKING";
  readonly version: number;
}

export interface LockedKeySession {
  readonly key_slot_id: string | null;
  readonly location_id: string;
  readonly organization_id: string;
  readonly session_id: string;
  readonly state: string;
  readonly version: number;
}

export interface AuthorizedKeySession extends LockedKeySession {
  readonly actorMembershipId: string;
}
