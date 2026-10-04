import { randomUUID } from "node:crypto";

import { type ShiftPresenceOperation } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { ShiftPresenceError } from "./shift-presence-errors";
import { allocatePresenceOperation, lockPresenceOperation } from "./shift-presence-operation";

export interface PresenceChallengeRow {
  id: string;
  operation_row_id: string;
  issued_at: Date;
  expires_at: Date;
  consumed_at: Date | null;
  decision_id: string | null;
}

/** Only after caller proves existing Start or safe-own-End authority and locks configuration. */
export async function allocatePresenceChallenge(transaction: PostgresTransaction, input: ShiftPresenceOperation) {
  const operation = await allocatePresenceOperation(transaction, input);
  const time = await transaction.query<{ now: Date }>(`SELECT clock_timestamp() AS now`);
  if (operation.status !== "PENDING" || operation.expires_at <= time.rows[0]!.now) {
    throw new ShiftPresenceError("PRESENCE_OPERATION_EXPIRED");
  }
  await transaction.query(
    `INSERT INTO shift_presence_challenges
       (id,organization_id,location_id,user_id,membership_id,action,shift_id,operation_row_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (operation_row_id) DO NOTHING`,
    [randomUUID(), input.organizationId, input.locationId, input.userId, input.membershipId,
      input.action, input.shiftId, operation.id],
  );
  return lockPresenceChallenge(transaction, input);
}

export async function lockPresenceChallenge(transaction: PostgresTransaction, input: ShiftPresenceOperation) {
  const operation = await lockPresenceOperation(transaction, input);
  const result = await transaction.query<PresenceChallengeRow>(
    `SELECT * FROM shift_presence_challenges WHERE operation_row_id=$1 FOR UPDATE`, [operation.id],
  );
  const challenge = result.rows[0];
  if (challenge === undefined) throw new ShiftPresenceError("PRESENCE_SCOPE_MISMATCH");
  return challenge;
}
