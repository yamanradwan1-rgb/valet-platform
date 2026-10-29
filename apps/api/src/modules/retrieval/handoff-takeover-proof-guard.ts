import type { PostgresTransaction } from "../../common/database/postgres";

interface ProofTakeoverScope {
  readonly organizationId: string;
  readonly sessionId: string;
  readonly sessionState: string;
  readonly operationTime: Date;
}

interface RetrievalCustodyScope {
  readonly organizationId: string;
  readonly locationId: string;
  readonly sessionId: string;
  readonly taskId: string;
  readonly keySlotId: string | null;
  readonly currentAssigneeMembershipId: string;
}

type IntegrityConflict = () => never;

/**
 * Called after the session/task authority and locks have been established.
 * A valid HANDOFF_PENDING takeover retires ALL unconsumed proofs, including
 * verified proofs, while keeping their verification history intact.
 */
export async function consumeUnconsumedHandoffProofsForTakeover(
  transaction: PostgresTransaction,
  scope: ProofTakeoverScope,
  integrityConflict: IntegrityConflict,
): Promise<readonly string[]> {
  const rows = await transaction.query<{ id: string }>(
    `SELECT id::text
     FROM handoff_verifications
     WHERE organization_id = $1 AND valet_session_id = $2
       AND consumed_at IS NULL
     ORDER BY created_at, id FOR UPDATE`,
    [scope.organizationId, scope.sessionId],
  );
  if (scope.sessionState !== "HANDOFF_PENDING") {
    if (rows.rows.length !== 0) integrityConflict();
    return [];
  }
  if (rows.rows.length === 0) return [];
  const ids = rows.rows.map(({ id }) => id);
  const consumed = await transaction.query<{ id: string }>(
    `UPDATE handoff_verifications SET consumed_at = $3
     WHERE organization_id = $1 AND valet_session_id = $2
       AND consumed_at IS NULL
     RETURNING id::text`,
    [scope.organizationId, scope.sessionId, scope.operationTime],
  );
  if (
    consumed.rowCount !== ids.length ||
    consumed.rows.some(({ id }) => !ids.includes(id))
  ) {
    integrityConflict();
  }
  return ids;
}

/**
 * In-progress Retrieval has no accepted mid-task custody transfer command.
 * Once an emergency owner-change occurred, historical A checkout cannot
 * authorize B, including after an A→B→A ownership cycle.
 */
export async function assertPostTakeoverRetrievalCustodyEvidence(
  transaction: PostgresTransaction,
  scope: RetrievalCustodyScope,
  custodyConflict: IntegrityConflict,
): Promise<void> {
  const epoch = await transaction.query<{ occurred_at: Date }>(
    `SELECT occurred_at
     FROM dispatch_events
     WHERE organization_id = $1 AND location_id = $2
       AND valet_session_id = $3 AND task_id = $4
       AND event_type = 'EMERGENCY_TAKEOVER'
     ORDER BY occurred_at DESC, id DESC LIMIT 1`,
    [scope.organizationId, scope.locationId, scope.sessionId, scope.taskId],
  );
  const changedAt = epoch.rows[0]?.occurred_at;
  if (changedAt === undefined) return;
  if (scope.keySlotId === null) custodyConflict();

  const custody = await transaction.query<{
    actor_membership_id: string;
    event_type: string;
    key_slot_id: string | null;
    occurred_at: Date;
  }>(
    `SELECT actor_membership_id::text, event_type::text,
            key_slot_id::text, occurred_at
     FROM key_custody_events
     WHERE organization_id = $1 AND location_id = $2
       AND valet_session_id = $3
     ORDER BY occurred_at DESC, id DESC LIMIT 1`,
    [scope.organizationId, scope.locationId, scope.sessionId],
  );
  const latest = custody.rows[0];
  if (
    latest === undefined ||
    latest.event_type !== "CHECKED_OUT" ||
    latest.actor_membership_id !== scope.currentAssigneeMembershipId ||
    latest.key_slot_id !== scope.keySlotId ||
    latest.occurred_at.getTime() <= changedAt.getTime()
  ) {
    custodyConflict();
  }
}
