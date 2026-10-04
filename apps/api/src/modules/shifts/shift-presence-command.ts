import { randomUUID } from "node:crypto";

import type {
  ShiftPresenceOperation,
  ShiftPresenceDenialReason,
} from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import {
  allocatePresenceChallenge,
  lockPresenceChallenge,
} from "./shift-presence-challenge";
import { consumePresenceChallenge } from "./shift-presence-decision";
import { evaluateShiftPresence } from "./shift-presence-evaluator";
import type { ShiftPresenceEvaluation } from "./shift-presence-evaluator";
import { ShiftPresenceError } from "./shift-presence-errors";
import { fingerprintShiftPresenceRequest } from "./shift-presence-fingerprint";
import {
  bindPresenceAttempt,
  completePresenceOperation,
} from "./shift-presence-operation";
import { lockShiftPresenceConfiguration } from "./shift-presence-policy";
import {
  resolvePresenceOperation,
  requestFingerprint,
  type PresenceShiftAttempt,
} from "./shift-presence-attempt";
export {
  presenceOperation,
  recoverPresenceShiftAttempt,
  type PresenceDeniedResult,
} from "./shift-presence-attempt";

/** Only called after ordinary Start authority or End ownership/cash/open-work checks. */
export async function preparePresenceShiftAttempt(
  transaction: PostgresTransaction,
  input: PresenceShiftAttempt,
  keyInput?: Uint8Array,
) {
  const configuration = await lockShiftPresenceConfiguration(
    transaction,
    input,
  );
  const mode =
    input.action === "START"
      ? configuration.policy.startMode
      : configuration.policy.endMode;
  if (mode === "OFF" && input.evidence === undefined)
    return { commit: async () => {} };
  if (input.evidence === undefined && mode !== "WARN_ONLY")
    return { denied: "PRESENCE_REQUIRED" as const };
  // Legacy WARN_ONLY has no client intent selector; allocate an internal truthful journal.
  const legacy = input.evidence === undefined;
  const operationId = input.evidence?.operationId ?? randomUUID();
  const { key, operation } = await resolvePresenceOperation(
    transaction,
    input,
    operationId,
    keyInput,
  );
  if (input.evidence?.kind === "EXCEPTION" && mode === "REQUIRE_OR_OVERRIDE") {
    const fingerprint = requestFingerprint(
      input,
      operation,
      configuration.fingerprint,
      key,
    );
    const revoked = await transaction.query<{ revoked: boolean }>(
      `SELECT shift_presence_expire_revoked_approval($1,$2,$3,$4,$5,$6,$7) AS revoked`,
      [
        input.userId,
        operationId,
        input.evidence.exceptionId,
        randomUUID(),
        operation.targetFingerprint,
        fingerprint,
        configuration.fingerprint,
      ],
    );
    if (revoked.rows[0]?.revoked === true)
      return { denied: "APPROVER_AUTHORITY_REVOKED" as const };
    await requireActiveExceptionRequester(transaction, input);
  }
  const challenge = legacy
    ? await allocatePresenceChallenge(transaction, operation)
    : await lockPresenceChallenge(transaction, operation);
  if (!legacy && challenge.id !== input.evidence!.challengeId) {
    throw new ShiftPresenceError("PRESENCE_SCOPE_MISMATCH");
  }
  const { rows } = await transaction.query<{ now: Date }>(
    `SELECT clock_timestamp() AS now`,
  );
  if (challenge.consumed_at !== null)
    throw new ShiftPresenceError("PRESENCE_CHALLENGE_CONSUMED");
  if (rows[0]!.now >= challenge.expires_at)
    throw new ShiftPresenceError("PRESENCE_CHALLENGE_EXPIRED");
  const fingerprint = legacy
    ? fingerprintShiftPresenceRequest(
        {
          ...operation,
          cashReported: input.cashReported,
          policyFingerprint: configuration.fingerprint,
          evidence: { kind: "MISSING", challengeId: challenge.id },
        },
        key,
      )
    : requestFingerprint(input, operation, configuration.fingerprint, key);
  await bindPresenceAttempt(
    transaction,
    operation,
    fingerprint,
    configuration.fingerprint,
  );
  let exceptionId: string | null = null;
  if (
    input.evidence?.kind === "EXCEPTION" &&
    mode !== "OFF" &&
    mode !== "WARN_ONLY"
  ) {
    if (mode !== "REQUIRE_OR_OVERRIDE")
      return deny(transaction, operation, "PRESENCE_REJECTED");
    const exception = await transaction.query<{
      status: string;
      expires_at: Date;
      challenge_id: string;
    }>(
      `SELECT status::text,expires_at,challenge_id::text FROM shift_presence_exceptions
       WHERE id=$1 AND organization_id=$2 AND location_id=$3 AND user_id=$4 AND membership_id=$5
         AND action=$6 AND shift_id IS NOT DISTINCT FROM $7::uuid FOR UPDATE`,
      [
        input.evidence.exceptionId,
        input.organizationId,
        input.locationId,
        input.userId,
        input.membershipId,
        input.action,
        input.shiftId,
      ],
    );
    const approved = exception.rows[0];
    if (
      approved?.status !== "APPROVED" ||
      approved.challenge_id !== challenge.id ||
      approved.expires_at <= rows[0]!.now
    ) {
      return deny(transaction, operation, "PRESENCE_REJECTED");
    }
    exceptionId = input.evidence.exceptionId;
  }
  const evaluation = evaluateShiftPresence({
    scope: input,
    now: rows[0]!.now,
    policy: configuration.policy,
    zones: configuration.zones,
    measurement:
      input.evidence?.kind === "MEASURED"
        ? input.evidence.measurement
        : undefined,
    issuedAt: challenge.issued_at,
  });
  if (
    mode !== "OFF" &&
    mode !== "WARN_ONLY" &&
    exceptionId === null &&
    evaluation.classification !== "CONFIDENT_INSIDE"
  ) {
    return deny(transaction, operation, "PRESENCE_REJECTED", evaluation);
  }
  return {
    commit: async (shiftId: string) => {
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
          operationId,
          challengeId: challenge.id,
          policyFingerprint: configuration.fingerprint,
          appliedMode: mode,
          companyPolicyRevision: configuration.companyRevision,
          locationPolicyRevision: configuration.locationRevision,
          ...evaluation,
          exceptionId,
        },
        fingerprint,
      );
      if (exceptionId !== null) {
        await transaction.query(
          `UPDATE shift_presence_exceptions SET status='CONSUMED',revision=revision+1,
          consumed_decision_id=$2,terminal_at=clock_timestamp() WHERE id=$1`,
          [exceptionId, decisionId],
        );
      }
      await completePresenceOperation(transaction, operation, {
        status: "COMMITTED",
        shiftId,
        decisionId,
      });
    },
  };
}

async function deny(
  transaction: PostgresTransaction,
  operation: ShiftPresenceOperation,
  reason: ShiftPresenceDenialReason,
  summary?: ShiftPresenceEvaluation,
) {
  await transaction.query(
    `UPDATE shift_presence_operations SET status='DENIED',terminal_at=clock_timestamp(),denial_reason=$2,
    denial_classification=$4,denial_measurement_reason=$5
    WHERE user_id=$1 AND operation_id=$3 AND status='PENDING'`,
    [
      operation.userId,
      reason,
      operation.operationId,
      summary?.classification ?? null,
      summary?.reason ?? null,
    ],
  );
  return { denied: reason };
}

async function requireActiveExceptionRequester(
  transaction: PostgresTransaction,
  input: PresenceShiftAttempt,
) {
  const current = await transaction.query(
    `SELECT m.id FROM organization_memberships m
    JOIN users u ON u.id=m.user_id AND u.status='ACTIVE'
    JOIN organizations o ON o.id=m.organization_id AND o.status='ACTIVE'
    JOIN locations l ON l.organization_id=o.id AND l.id=$3 AND l.status='ACTIVE'
    JOIN membership_location_access a ON a.organization_id=m.organization_id AND a.membership_id=m.id AND a.location_id=l.id
    WHERE m.id=$1 AND m.user_id=$2 AND m.organization_id=$4 AND m.status='ACTIVE'
      AND m.role IN ('VALET_EMPLOYEE','VALET_SUPERVISOR') FOR SHARE OF m,u,o,l,a`,
    [input.membershipId, input.userId, input.locationId, input.organizationId],
  );
  if (current.rowCount !== 1)
    throw new ShiftPresenceError("PRESENCE_SCOPE_MISMATCH");
}
