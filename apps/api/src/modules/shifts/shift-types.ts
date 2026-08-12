export type ShiftStatus = "ACTIVE" | "ENDED";

export interface PersistedShiftRow {
  readonly ended_at: Date | null;
  readonly id: string;
  readonly location_id: string;
  readonly membership_id: string;
  readonly organization_id: string;
  readonly started_at: Date;
  readonly status: ShiftStatus;
}

export interface ShiftResult {
  readonly endedAt: Date | null;
  readonly locationId: string;
  readonly shiftId: string;
  readonly startedAt: Date;
  readonly status: ShiftStatus;
}

export function toShiftResult(row: PersistedShiftRow): ShiftResult {
  return {
    endedAt: row.ended_at,
    locationId: row.location_id,
    shiftId: row.id,
    startedAt: row.started_at,
    status: row.status,
  };
}
