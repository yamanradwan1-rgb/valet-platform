import { randomUUID } from "node:crypto";

import { shiftPresenceExceptionReasonSchema, type ShiftPresenceOperation } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { lockPresenceChallenge } from "./shift-presence-challenge";
import { ShiftPresenceError } from "./shift-presence-errors";
import { lockPresenceOperation } from "./shift-presence-operation";

interface ExceptionRow {
  id: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "CONSUMED";
  revision: number;
  expires_at: Date;
}

/** Request persistence only; caller has already proved exact requester authority. No approval command in GPS-A. */
export async function requestPresenceException(
  transaction: PostgresTransaction, operation: ShiftPresenceOperation, controlledReason: string,
) {
  const reason = shiftPresenceExceptionReasonSchema.parse(controlledReason);
  const intent = await lockPresenceOperation(transaction, operation);
  if (intent.status !== "PENDING") throw new ShiftPresenceError("PRESENCE_OPERATION_EXPIRED");
  const challenge = await lockPresenceChallenge(transaction, operation);
  const time = await transaction.query<{ now: Date }>(`SELECT clock_timestamp() AS now`);
  if (challenge.expires_at <= time.rows[0]!.now || challenge.consumed_at !== null) {
    throw new ShiftPresenceError("PRESENCE_CHALLENGE_EXPIRED");
  }
  await transaction.query(`INSERT INTO shift_presence_exceptions
    (id,organization_id,location_id,user_id,membership_id,action,shift_id,challenge_id,reason,expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (user_id,challenge_id) DO NOTHING`,
  [randomUUID(), operation.organizationId, operation.locationId, operation.userId, operation.membershipId,
    operation.action, operation.shiftId, challenge.id, reason, challenge.expires_at]);
  const result = await transaction.query<ExceptionRow>(`SELECT * FROM shift_presence_exceptions
    WHERE organization_id=$1 AND location_id=$2 AND user_id=$3 AND membership_id=$4
      AND action=$5 AND shift_id IS NOT DISTINCT FROM $6::uuid AND challenge_id=$7 FOR UPDATE`,
  [operation.organizationId, operation.locationId, operation.userId, operation.membershipId,
    operation.action, operation.shiftId, challenge.id]);
  const row = result.rows[0];
  if (row === undefined || row.reason !== reason) throw new ShiftPresenceError("PRESENCE_OPERATION_CONFLICT");
  return row;
}
