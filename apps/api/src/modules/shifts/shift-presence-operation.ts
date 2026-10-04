import { randomUUID } from "node:crypto";

import {
  shiftPresenceDigestSchema,
  shiftPresenceOperationSchema,
  shiftPresenceScopeSchema,
  type ShiftPresenceScope,
  type ShiftPresenceOperation,
  type ShiftPresenceDenialReason,
  type ShiftPresenceClassification,
  type ShiftPresenceReason,
} from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { ShiftPresenceError } from "./shift-presence-errors";
import { presenceRecoveryWindow } from "./shift-presence-retention";

export interface PresenceOperationRow {
  id: string;
  organization_id: string;
  location_id: string;
  user_id: string;
  membership_id: string;
  operation_id: string;
  action: "START" | "END";
  shift_id: string | null;
  target_fingerprint: string;
  request_fingerprint: string | null;
  request_policy_fingerprint: string | null;
  denial_reason: ShiftPresenceDenialReason | null;
  denial_classification: ShiftPresenceClassification | null;
  denial_measurement_reason: ShiftPresenceReason | null;
  status: "PENDING" | "COMMITTED" | "DENIED" | "EXPIRED";
  expires_at: Date;
  terminal_at: Date | null;
  result_shift_id: string | null;
  result_decision_id: string | null;
}

function assertIdentity(
  row: PresenceOperationRow | undefined,
  input: ShiftPresenceOperation,
) {
  if (
    row === undefined ||
    row.user_id !== input.userId ||
    row.membership_id !== input.membershipId ||
    row.organization_id !== input.organizationId ||
    row.location_id !== input.locationId ||
    row.action !== input.action ||
    row.shift_id !== input.shiftId ||
    row.target_fingerprint !== input.targetFingerprint
  ) {
    throw new ShiftPresenceError("PRESENCE_OPERATION_CONFLICT");
  }
  return row;
}

/** GPS-B must prove current principal/scope before calling, including on retry. */
export async function lockPresenceOperation(
  transaction: PostgresTransaction,
  input: ShiftPresenceOperation,
): Promise<PresenceOperationRow> {
  const parsed = shiftPresenceOperationSchema.parse(input);
  const result = await transaction.query<PresenceOperationRow>(
    `SELECT * FROM shift_presence_operations WHERE user_id=$1 AND operation_id=$2 FOR UPDATE`,
    [parsed.userId, parsed.operationId],
  );
  return assertIdentity(result.rows[0], parsed);
}

/** Caller owns transaction; failed contenders never catch/reuse an aborted transaction. */
export async function allocatePresenceOperation(
  transaction: PostgresTransaction,
  input: ShiftPresenceOperation,
): Promise<PresenceOperationRow> {
  const parsed = shiftPresenceOperationSchema.parse(input);
  await transaction.query(
    `INSERT INTO shift_presence_operations
       (id,organization_id,location_id,user_id,membership_id,operation_id,action,shift_id,target_fingerprint)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (user_id,operation_id) DO NOTHING`,
    [
      randomUUID(),
      parsed.organizationId,
      parsed.locationId,
      parsed.userId,
      parsed.membershipId,
      parsed.operationId,
      parsed.action,
      parsed.shiftId,
      parsed.targetFingerprint,
    ],
  );
  return lockPresenceOperation(transaction, parsed);
}

/** Final evidence is registered once; changed sample/cash/target must conflict. */
export async function bindPresenceAttempt(
  transaction: PostgresTransaction,
  input: ShiftPresenceOperation,
  requestFingerprint: string,
  policyFingerprint?: string,
) {
  const fingerprint = shiftPresenceDigestSchema.parse(requestFingerprint);
  const row = await lockPresenceOperation(transaction, input);
  if (row.request_fingerprint !== null) {
    if (row.request_fingerprint !== fingerprint)
      throw new ShiftPresenceError("PRESENCE_OPERATION_CONFLICT");
    return row;
  }
  const time = await transaction.query<{ now: Date }>(
    `SELECT clock_timestamp() AS now`,
  );
  if (row.status !== "PENDING" || row.expires_at <= time.rows[0]!.now) {
    throw new ShiftPresenceError("PRESENCE_OPERATION_EXPIRED");
  }
  const result = await transaction.query<PresenceOperationRow>(
    `UPDATE shift_presence_operations SET request_fingerprint=$2,request_policy_fingerprint=$3 WHERE id=$1 RETURNING *`,
    [row.id, fingerprint, policyFingerprint ?? null],
  );
  return result.rows[0]!;
}

/** Does not replay a mutation or reconstruct an expired response. Fresh authorization is a caller obligation. */
export async function readPresenceRecovery(
  transaction: PostgresTransaction,
  input: ShiftPresenceOperation,
  requestFingerprint: string,
) {
  shiftPresenceDigestSchema.parse(requestFingerprint);
  const parsed = shiftPresenceOperationSchema.parse(input);
  const found = await transaction.query<PresenceOperationRow>(
    `SELECT * FROM shift_presence_operations WHERE user_id=$1 AND operation_id=$2 FOR UPDATE`,
    [parsed.userId, parsed.operationId],
  );
  if (found.rows[0] === undefined) return { state: "EXPIRED" as const };
  const row = assertIdentity(found.rows[0], parsed);
  if (
    row.request_fingerprint !== null &&
    row.request_fingerprint !== requestFingerprint
  ) {
    throw new ShiftPresenceError("PRESENCE_OPERATION_CONFLICT");
  }
  return recoveryProjection(transaction, row);
}

/** Opaque-ID status after process death; current authorized scope is required, no original fix is required. */
export async function readPresenceOperationStatus(
  transaction: PostgresTransaction,
  scope: ShiftPresenceScope,
  operationId: string,
) {
  const parsed = shiftPresenceScopeSchema.parse(scope);
  shiftPresenceScopeSchema.shape.userId.parse(operationId);
  const found = await transaction.query<PresenceOperationRow>(
    `SELECT * FROM shift_presence_operations
     WHERE organization_id=$1 AND location_id=$2 AND user_id=$3 AND membership_id=$4 AND operation_id=$5 FOR UPDATE`,
    [
      parsed.organizationId,
      parsed.locationId,
      parsed.userId,
      parsed.membershipId,
      operationId,
    ],
  );
  if (found.rows[0] === undefined) return { state: "EXPIRED" as const };
  return recoveryProjection(transaction, found.rows[0]);
}

async function recoveryProjection(
  transaction: PostgresTransaction,
  row: PresenceOperationRow,
) {
  const time = await transaction.query<{ now: Date }>(
    `SELECT clock_timestamp() AS now`,
  );
  const now = time.rows[0]!.now;
  const window = presenceRecoveryWindow(row.terminal_at, now);
  if (row.status === "PENDING") {
    return {
      state: row.expires_at > now ? ("PENDING" as const) : ("EXPIRED" as const),
    };
  }
  if (window !== "RECOVERABLE") return { state: "EXPIRED" as const };
  return {
    state: "RECOVERABLE" as const,
    status: row.status,
    shiftId: row.result_shift_id,
    decisionId: row.result_decision_id,
  };
}

/** Records the protected effect or explicitly typed no-effect outcome in the caller's transaction. */
export async function completePresenceOperation(
  transaction: PostgresTransaction,
  input: ShiftPresenceOperation,
  result: {
    readonly status: "COMMITTED" | "DENIED" | "EXPIRED";
    readonly shiftId: string | null;
    readonly decisionId: string | null;
    readonly completionBasis?: "OFF_NO_EVIDENCE" | "NO_EFFECT_CONVERGENCE";
  },
) {
  const row = await lockPresenceOperation(transaction, input);
  if (row.status !== "PENDING")
    throw new ShiftPresenceError("PRESENCE_OPERATION_CONFLICT");
  await transaction.query(
    `UPDATE shift_presence_operations SET status=$2,terminal_at=clock_timestamp(),
      result_shift_id=$3,result_decision_id=$4,completion_basis=$5 WHERE id=$1`,
    [
      row.id,
      result.status,
      result.shiftId,
      result.decisionId,
      result.completionBasis ?? null,
    ],
  );
}
