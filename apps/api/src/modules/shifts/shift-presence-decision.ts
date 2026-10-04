import { randomUUID } from "node:crypto";

import { shiftPresenceDecisionSchema, type ShiftPresenceDecision, type ShiftPresenceOperation } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { lockPresenceChallenge } from "./shift-presence-challenge";
import { bindPresenceAttempt } from "./shift-presence-operation";
import { ShiftPresenceError } from "./shift-presence-errors";

/** Evaluated history only; attempt digest is bound separately on the ephemeral Operation. */
export async function consumePresenceChallenge(
  transaction: PostgresTransaction, operation: ShiftPresenceOperation, input: ShiftPresenceDecision,
  requestFingerprint: string,
): Promise<string> {
  const decision = shiftPresenceDecisionSchema.parse(input);
  if (decision.organizationId !== operation.organizationId || decision.locationId !== operation.locationId
    || decision.userId !== operation.userId || decision.membershipId !== operation.membershipId
    || decision.action !== operation.action || decision.operationId !== operation.operationId
    || (operation.action === "END" && decision.shiftId !== operation.shiftId)) {
    throw new ShiftPresenceError("PRESENCE_SCOPE_MISMATCH");
  }
  const challenge = await lockPresenceChallenge(transaction, operation);
  if (challenge.id !== decision.challengeId) throw new ShiftPresenceError("PRESENCE_SCOPE_MISMATCH");
  if (challenge.consumed_at !== null) throw new ShiftPresenceError("PRESENCE_CHALLENGE_CONSUMED");
  const time = await transaction.query<{ now: Date }>(`SELECT clock_timestamp() AS now`);
  if (time.rows[0]!.now >= challenge.expires_at) throw new ShiftPresenceError("PRESENCE_CHALLENGE_EXPIRED");
  await bindPresenceAttempt(transaction, operation, requestFingerprint);
  const id = randomUUID();
  await transaction.query(
    `INSERT INTO shift_presence_decisions
      (id,organization_id,location_id,user_id,membership_id,action,shift_id,operation_id,challenge_id,
       policy_fingerprint,zone_id,zone_revision,classification,reason,accuracy_band,freshness_band,exception_id,
       applied_mode,company_policy_revision,location_policy_revision)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
    [id, decision.organizationId, decision.locationId, decision.userId, decision.membershipId,
      decision.action, decision.shiftId, decision.operationId, decision.challengeId,
      decision.policyFingerprint, decision.zoneId, decision.zoneRevision,
      decision.classification, decision.reason, decision.accuracyBand, decision.freshnessBand, decision.exceptionId,
      decision.appliedMode, decision.companyPolicyRevision, decision.locationPolicyRevision],
  );
  await transaction.query(
    `UPDATE shift_presence_challenges SET consumed_at=clock_timestamp(),decision_id=$2 WHERE id=$1`, [challenge.id, id],
  );
  return id;
}
