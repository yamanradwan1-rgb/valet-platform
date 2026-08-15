export type ShiftStatus = "ACTIVE" | "ENDED";

export interface PersistedShiftRow {
  readonly cash_currency: string | null;
  readonly cash_expected: string | null;
  readonly cash_reported: string | null;
  readonly cash_reported_at: Date | null;
  readonly cash_variance: string | null;
  readonly ended_at: Date | null;
  readonly id: string;
  readonly location_id: string;
  readonly membership_id: string;
  readonly organization_id: string;
  readonly started_at: Date;
  readonly status: ShiftStatus;
}

export interface ShiftResult {
  readonly cashReconciliation: ShiftCashReconciliation | null;
  readonly endedAt: Date | null;
  readonly locationId: string;
  readonly shiftId: string;
  readonly startedAt: Date;
  readonly status: ShiftStatus;
}

export interface ShiftCashReconciliation {
  readonly cashExpected: string;
  readonly cashReported: string;
  readonly cashVariance: string;
  readonly currency: string;
  readonly reportedAt: Date;
}

export function toShiftResult(row: PersistedShiftRow): ShiftResult {
  return {
    cashReconciliation:
      row.cash_reported_at === null
        ? null
        : {
            cashExpected: row.cash_expected!,
            cashReported: row.cash_reported!,
            cashVariance: row.cash_variance!,
            currency: row.cash_currency!,
            reportedAt: row.cash_reported_at,
          },
    endedAt: row.ended_at,
    locationId: row.location_id,
    shiftId: row.id,
    startedAt: row.started_at,
    status: row.status,
  };
}
