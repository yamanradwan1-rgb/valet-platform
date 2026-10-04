import type { PostgresTransaction } from "../../common/database/postgres";
import { lockPresenceChallenge } from "./shift-presence-challenge";
import { consumePresenceChallenge } from "./shift-presence-decision";
import { evaluateShiftPresence } from "./shift-presence-evaluator";
import { ShiftPresenceError } from "./shift-presence-errors";
import {
  bindPresenceAttempt,
  completePresenceOperation,
} from "./shift-presence-operation";
import {
  requestFingerprint,
  resolvePresenceOperation,
  type PresenceShiftAttempt,
} from "./shift-presence-attempt";
import type { lockShiftPresenceConfiguration } from "./shift-presence-policy";

/** Called only after existing command authority/cash/open-work and configuration guards. */
export async function prepareCorrelatedNoEvidence(
  transaction: PostgresTransaction,
  input: PresenceShiftAttempt,
  configuration: Awaited<ReturnType<typeof lockShiftPresenceConfiguration>>,
  keyInput?: Uint8Array,
) {
  const { operation, key } = await resolvePresenceOperation(
    transaction,
    input,
    input.operationId!,
    keyInput,
  );
  const challenge = await lockPresenceChallenge(transaction, operation);
  const time = await transaction.query<{ now: Date }>(
    "SELECT clock_timestamp() AS now",
  );
  if (challenge.consumed_at !== null)
    throw new ShiftPresenceError("PRESENCE_CHALLENGE_CONSUMED");
  if (time.rows[0]!.now >= challenge.expires_at)
    throw new ShiftPresenceError("PRESENCE_CHALLENGE_EXPIRED");
  const fingerprint = requestFingerprint(
    input,
    operation,
    configuration.fingerprint,
    key,
  );
  await bindPresenceAttempt(
    transaction,
    operation,
    fingerprint,
    configuration.fingerprint,
  );
  const mode =
    input.action === "START"
      ? configuration.policy.startMode
      : configuration.policy.endMode;
  if (mode === "REQUIRE" || mode === "REQUIRE_OR_OVERRIDE") {
    await transaction.query(
      `UPDATE shift_presence_operations SET status='DENIED',terminal_at=clock_timestamp(),
        denial_reason='PRESENCE_REQUIRED' WHERE user_id=$1 AND operation_id=$2 AND status='PENDING'`,
      [input.userId, operation.operationId],
    );
    return { denied: "PRESENCE_REQUIRED" as const };
  }
  return {
    commit: async (shiftId: string) => {
      if (mode === "OFF") {
        await completePresenceOperation(transaction, operation, {
          status: "COMMITTED",
          shiftId,
          decisionId: null,
          completionBasis: "OFF_NO_EVIDENCE",
        });
        return;
      }
      const evaluation = evaluateShiftPresence({
        scope: input,
        now: time.rows[0]!.now,
        policy: configuration.policy,
        zones: configuration.zones,
        measurement: undefined,
        issuedAt: challenge.issued_at,
      });
      const decisionId = await consumePresenceChallenge(
        transaction,
        operation,
        {
          organizationId: input.organizationId,
          locationId: input.locationId,
          userId: input.userId,
          membershipId: input.membershipId,
          action: input.action,
          shiftId,
          operationId: operation.operationId,
          challengeId: challenge.id,
          policyFingerprint: configuration.fingerprint,
          appliedMode: mode,
          companyPolicyRevision: configuration.companyRevision,
          locationPolicyRevision: configuration.locationRevision,
          ...evaluation,
          exceptionId: null,
        },
        fingerprint,
      );
      await completePresenceOperation(transaction, operation, {
        status: "COMMITTED",
        shiftId,
        decisionId,
      });
    },
  };
}
