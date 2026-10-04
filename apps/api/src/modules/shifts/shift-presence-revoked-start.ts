import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { StartShiftCommandRequest } from "./start-shift-command";
import { requireActiveShiftUser } from "./shift-authorization";
import {
  resolvePresenceOperation,
  requestFingerprint,
  recoverPresenceShiftAttempt,
  type PresenceDeniedResult,
} from "./shift-presence-attempt";
import type { PresenceOperationRow } from "./shift-presence-operation";
import { lockShiftPresenceConfiguration } from "./shift-presence-policy";

/** Narrow owned denial path. It never grants Start authority or creates a Shift. */
export async function denyRevokedPresenceStart(
  transaction: PostgresTransaction,
  request: StartShiftCommandRequest,
  keyInput?: Uint8Array,
): Promise<PresenceDeniedResult | undefined> {
  if (request.presence?.kind !== "EXCEPTION") return undefined;
  await requireActiveShiftUser(transaction, request.authenticatedUserId);
  const found = await transaction.query<PresenceOperationRow>(
    `SELECT o.* FROM shift_presence_operations o JOIN organization_memberships m
       ON m.id=o.membership_id AND m.organization_id=o.organization_id AND m.user_id=o.user_id
     WHERE o.user_id=$1 AND o.operation_id=$2 AND o.action='START' AND o.location_id=$3`,
    [
      request.authenticatedUserId,
      request.presence.operationId,
      request.targetLocationId,
    ],
  );
  const row = found.rows[0];
  if (row === undefined) return undefined;
  const input = {
    userId: row.user_id,
    membershipId: row.membership_id,
    organizationId: row.organization_id,
    locationId: row.location_id,
    action: "START" as const,
    shiftId: null,
    cashReported: null,
    evidence: request.presence,
  };
  if (
    row.status === "DENIED" &&
    row.denial_reason === "APPROVER_AUTHORITY_REVOKED"
  ) {
    const recovered = await recoverPresenceShiftAttempt(
      transaction,
      input,
      keyInput,
    );
    return recovered !== undefined && "denied" in recovered
      ? recovered
      : undefined;
  }
  if (row.status !== "PENDING") return undefined;
  const configuration = await lockShiftPresenceConfiguration(
    transaction,
    input,
  );
  const { operation, key } = await resolvePresenceOperation(
    transaction,
    input,
    row.operation_id,
    keyInput,
  );
  const result = await transaction.query<{ revoked: boolean }>(
    `SELECT shift_presence_expire_revoked_approval($1,$2,$3,$4,$5,$6,$7) AS revoked`,
    [
      input.userId,
      row.operation_id,
      request.presence.exceptionId,
      randomUUID(),
      operation.targetFingerprint,
      requestFingerprint(input, operation, configuration.fingerprint, key),
      configuration.fingerprint,
    ],
  );
  return result.rows[0]?.revoked === true
    ? { denied: "APPROVER_AUTHORITY_REVOKED" }
    : undefined;
}
