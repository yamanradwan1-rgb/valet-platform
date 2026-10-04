import type {
  ShiftPresenceEvidence,
  ShiftPresenceOperation,
  ShiftPresenceDenialReason,
} from "@valet/contracts";
import type { PostgresTransaction } from "../../common/database/postgres";
import { ShiftPresenceError } from "./shift-presence-errors";
import {
  fingerprintShiftPresenceIntent,
  fingerprintShiftPresenceRequest,
} from "./shift-presence-fingerprint";
import { presenceRecoveryWindow } from "./shift-presence-retention";
import { presenceFingerprintKeys } from "./shift-presence-security";
import {
  toShiftResult,
  type PersistedShiftRow,
  type ShiftResult,
} from "./shift-types";
export interface PresenceShiftAttempt {
  readonly userId: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly locationId: string;
  readonly action: "START" | "END";
  readonly shiftId: string | null;
  readonly cashReported: string | null;
  readonly evidence?: ShiftPresenceEvidence;
  readonly operationId?: string;
}

export interface PresenceDeniedResult {
  readonly denied: ShiftPresenceDenialReason;
}

export function presenceOperation(
  input: PresenceShiftAttempt,
  operationId: string,
  key: Uint8Array,
): ShiftPresenceOperation {
  const targetFingerprint = fingerprintShiftPresenceIntent(
    { ...input, operationId },
    key,
  );
  const scope = {
    userId: input.userId,
    membershipId: input.membershipId,
    organizationId: input.organizationId,
    locationId: input.locationId,
    operationId,
    targetFingerprint,
  };
  return input.action === "START"
    ? { ...scope, action: "START", shiftId: null }
    : { ...scope, action: "END", shiftId: input.shiftId! };
}

export function requestFingerprint(
  input: PresenceShiftAttempt,
  operation: ShiftPresenceOperation,
  policyFingerprint: string,
  key: Uint8Array,
) {
  const evidence = input.evidence ?? { kind: "CORRELATED_MISSING" as const };
  return fingerprintShiftPresenceRequest(
    {
      ...operation,
      cashReported: input.cashReported,
      policyFingerprint,
      evidence,
    },
    key,
  );
}

/** Exact committed attempt is resolved before ordinary state-based convergence. */
export async function recoverPresenceShiftAttempt(
  transaction: PostgresTransaction,
  input: PresenceShiftAttempt,
  keyInput?: Uint8Array,
): Promise<ShiftResult | PresenceDeniedResult | undefined> {
  const operationId = input.operationId ?? input.evidence?.operationId;
  if (operationId === undefined) return undefined;
  if (
    input.evidence !== undefined &&
    input.evidence.operationId !== operationId
  )
    throw new ShiftPresenceError("PRESENCE_OPERATION_CONFLICT");
  const { key, operation } = await resolvePresenceOperation(
    transaction,
    input,
    operationId,
    keyInput,
  );
  const found = await transaction.query<
    import("./shift-presence-operation").PresenceOperationRow
  >(
    `SELECT * FROM shift_presence_operations WHERE user_id=$1 AND operation_id=$2`,
    [input.userId, operation.operationId],
  );
  const row = found.rows[0];
  if (
    row === undefined ||
    row.organization_id !== input.organizationId ||
    row.location_id !== input.locationId ||
    row.membership_id !== input.membershipId ||
    row.action !== input.action ||
    row.shift_id !== input.shiftId ||
    row.target_fingerprint !== operation.targetFingerprint
  )
    throw new ShiftPresenceError("PRESENCE_OPERATION_CONFLICT");
  if (row.status === "PENDING") return undefined;
  const { rows: times } = await transaction.query<{ now: Date }>(
    `SELECT clock_timestamp() AS now`,
  );
  if (
    presenceRecoveryWindow(row.terminal_at, times[0]!.now) !== "RECOVERABLE"
  ) {
    throw new ShiftPresenceError("PRESENCE_OPERATION_EXPIRED");
  }
  if (
    row.request_fingerprint !== null &&
    (row.request_policy_fingerprint === null ||
      row.request_fingerprint !==
        requestFingerprint(
          input,
          operation,
          row.request_policy_fingerprint,
          key,
        ))
  ) {
    throw new ShiftPresenceError("PRESENCE_OPERATION_CONFLICT");
  }
  if (row.status === "DENIED")
    return { denied: row.denial_reason ?? "PRESENCE_REJECTED" };
  if (row.status !== "COMMITTED" || row.result_shift_id === null) {
    throw new ShiftPresenceError("PRESENCE_OPERATION_EXPIRED");
  }
  const result = await transaction.query<PersistedShiftRow>(
    `SELECT id::text,organization_id::text,location_id::text,membership_id::text,
      status::text,started_at,ended_at,cash_expected::text,cash_reported::text,
      cash_variance::text,cash_currency,cash_reported_at
     FROM shifts WHERE id=$1 AND organization_id=$2 AND membership_id=$3`,
    [row.result_shift_id, input.organizationId, input.membershipId],
  );
  const shift = result.rows[0];
  if (shift === undefined)
    throw new ShiftPresenceError("PRESENCE_SCOPE_MISMATCH");
  const projection = toShiftResult(shift);
  return input.action === "START"
    ? {
        ...projection,
        status: "ACTIVE",
        endedAt: null,
        cashReconciliation: null,
      }
    : projection;
}

export async function resolvePresenceOperation(
  transaction: PostgresTransaction,
  input: PresenceShiftAttempt,
  operationId: string,
  keyInput?: Uint8Array,
) {
  const keys = presenceFingerprintKeys(keyInput);
  const found = await transaction.query<{ target_fingerprint: string }>(
    "SELECT target_fingerprint FROM shift_presence_operations WHERE user_id=$1 AND operation_id=$2",
    [input.userId, operationId],
  );
  const fingerprint = found.rows[0]?.target_fingerprint;
  if (
    fingerprint === undefined &&
    input.operationId !== undefined &&
    input.evidence === undefined
  )
    throw new ShiftPresenceError("PRESENCE_SCOPE_MISMATCH");
  const key =
    fingerprint === undefined
      ? keys[0]!
      : keys.find(
          (candidate) =>
            presenceOperation(input, operationId, candidate)
              .targetFingerprint === fingerprint,
        );
  if (key === undefined)
    throw new ShiftPresenceError("PRESENCE_OPERATION_CONFLICT");
  return { key, operation: presenceOperation(input, operationId, key) };
}
