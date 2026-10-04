import type { PostgresTransaction } from "../../common/database/postgres";
import { lockPresenceChallenge } from "./shift-presence-challenge";
import { ShiftPresenceError } from "./shift-presence-errors";
import {
  bindPresenceAttempt,
  completePresenceOperation,
} from "./shift-presence-operation";
import { readGuardedShiftPresenceConfiguration } from "./shift-presence-policy";
import {
  requestFingerprint,
  resolvePresenceOperation,
  type PresenceShiftAttempt,
} from "./shift-presence-attempt";
import { parseShiftMoney } from "./shift-money";
import type { PersistedShiftRow } from "./shift-types";

/** Caller has freshly authorized and locked the exact already-satisfied Shift.
 * Settings/lifecycle guards precede those locks. This records no business effect.
 */
export async function convergePresenceShiftAttempt(
  transaction: PostgresTransaction,
  input: PresenceShiftAttempt,
  shift: PersistedShiftRow,
  keyInput?: Uint8Array,
) {
  const operationId = input.operationId ?? input.evidence?.operationId;
  if (operationId === undefined) return;
  if (
    shift.organization_id !== input.organizationId ||
    shift.location_id !== input.locationId ||
    shift.membership_id !== input.membershipId ||
    (input.action === "START"
      ? shift.status !== "ACTIVE"
      : shift.status !== "ENDED" || shift.id !== input.shiftId)
  ) {
    throw new ShiftPresenceError("PRESENCE_OPERATION_CONFLICT");
  }
  if (
    input.action === "END" &&
    (shift.cash_reported_at === null ||
      shift.cash_reported === null ||
      parseShiftMoney(input.cashReported!) !==
        parseShiftMoney(shift.cash_reported))
  ) {
    throw new ShiftPresenceError("PRESENCE_OPERATION_CONFLICT");
  }
  if (
    input.evidence !== undefined &&
    input.evidence.operationId !== operationId
  )
    throw new ShiftPresenceError("PRESENCE_OPERATION_CONFLICT");
  const configuration = await readGuardedShiftPresenceConfiguration(
    transaction,
    input,
  );
  const { operation, key } = await resolvePresenceOperation(
    transaction,
    input,
    operationId,
    keyInput,
  );
  const challenge = await lockPresenceChallenge(transaction, operation);
  if (
    input.evidence !== undefined &&
    input.evidence.challengeId !== challenge.id
  )
    throw new ShiftPresenceError("PRESENCE_SCOPE_MISMATCH");
  if (challenge.consumed_at !== null)
    throw new ShiftPresenceError("PRESENCE_CHALLENGE_CONSUMED");
  const { rows } = await transaction.query<{ now: Date }>(
    "SELECT clock_timestamp() AS now",
  );
  if (rows[0]!.now >= challenge.expires_at)
    throw new ShiftPresenceError("PRESENCE_CHALLENGE_EXPIRED");
  await bindPresenceAttempt(
    transaction,
    operation,
    requestFingerprint(input, operation, configuration.fingerprint, key),
    configuration.fingerprint,
  );
  await completePresenceOperation(transaction, operation, {
    status: "COMMITTED",
    shiftId: shift.id,
    decisionId: null,
    completionBasis: "NO_EFFECT_CONVERGENCE",
  });
}
