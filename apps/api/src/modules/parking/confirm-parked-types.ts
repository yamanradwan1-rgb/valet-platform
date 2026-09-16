export interface LockedConfirmSession {
  readonly id: string;
  readonly key_slot_id: string | null;
  readonly location_id: string;
  readonly organization_id: string;
  readonly parked_at: Date | null;
  readonly parking_spot_id: string | null;
  readonly parking_started_at: Date | null;
  readonly parking_zone_id: string | null;
  readonly state: string;
  readonly version: number;
}

export interface LockedConfirmTask {
  readonly current_assignee_membership_id: string | null;
  readonly id: string;
  readonly location_id: string;
  readonly organization_id: string;
  readonly status: string;
  readonly valet_session_id: string;
  readonly version: number;
}

export interface LockedParkingSpot {
  readonly code: string;
  readonly id: string;
  readonly parking_zone_id: string;
}

export interface LockedParkingTarget {
  readonly parkingSpotCode: string | null;
  readonly parkingSpotId: string | null;
  readonly parkingZoneId: string;
}

export type ConfirmKeySlotMode = "binding" | "legacy";

export interface ConfirmParkedKeyBinding {
  readonly expectedCurrentKeySlotId: string | null;
  readonly newKeySlotId: string;
}

export interface LockedConfirmKeySlot extends ConfirmParkedKeyBinding {
  readonly mode: ConfirmKeySlotMode;
}

export interface ConfirmParkedResult {
  readonly parkedAt: string;
  readonly parkingSpotCode: string | null;
  readonly parkingSpotId: string | null;
  readonly parkingZoneId: string;
  readonly sessionId: string;
  readonly sessionVersion: number;
  readonly state: "PARKED";
  readonly taskId: string;
  readonly taskStatus: "COMPLETED";
  readonly taskVersion: number;
}
