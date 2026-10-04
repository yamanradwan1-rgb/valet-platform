import { shiftPresenceManagementExceptionSchema } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { requireMfaAssuranceInTransaction } from "../auth/mfa/mfa-assurance-policy";
import type { PresenceManagementActor } from "./presence-management-authority";
import { appendPresenceManagementAudit } from "./presence-management-audit";
import { PresenceManagementError } from "./presence-management-errors";
import { ManagementAccessDeniedError } from "./management-authorization";

const projectionColumns = `e.id::text AS "exceptionId", e.location_id::text AS "locationId",e.action,e.shift_id::text AS "shiftId",
  e.reason,e.status,e.revision,e.requested_at AS "requestedAt",e.expires_at AS "expiresAt",
  e.reviewed_at AS "reviewedAt",e.terminal_at AS "terminalAt",l.timezone,
  e.user_id::text AS "requesterUserId",e.membership_id::text AS "requesterMembershipId",
  m.first_name AS "firstName",m.last_name AS "lastName",u.email,
  (e.status='PENDING' AND clock_timestamp()<e.expires_at AND e.user_id<>$3
    AND u.status='ACTIVE' AND EXISTS (
      SELECT 1 FROM organization_memberships m WHERE m.id=e.membership_id
        AND m.organization_id=e.organization_id AND m.user_id=e.user_id
        AND m.role IN ('VALET_EMPLOYEE','VALET_SUPERVISOR')
        AND ((e.action='START' AND m.status='ACTIVE' AND l.status='ACTIVE' AND EXISTS (
          SELECT 1 FROM membership_location_access a WHERE a.membership_id=m.id
            AND a.organization_id=e.organization_id AND a.location_id=e.location_id))
          OR (e.action='END' AND EXISTS (SELECT 1 FROM shifts s WHERE s.id=e.shift_id
            AND s.membership_id=m.id AND s.location_id=e.location_id AND s.organization_id=e.organization_id AND s.status='ACTIVE'))))
    AND EXISTS (SELECT 1 FROM shift_presence_challenges c JOIN shift_presence_operations o ON o.id=c.operation_row_id
      WHERE c.id=e.challenge_id AND c.consumed_at IS NULL AND clock_timestamp()<c.expires_at
        AND o.status='PENDING' AND clock_timestamp()<o.expires_at)) AS "canReview"`;
const projectionJoin = `FROM shift_presence_exceptions e JOIN locations l ON l.id=e.location_id AND l.organization_id=e.organization_id
  JOIN users u ON u.id=e.user_id
  JOIN organization_memberships m ON m.id=e.membership_id AND m.user_id=e.user_id AND m.organization_id=e.organization_id
  WHERE e.organization_id=$1 AND e.location_id=$2`;

function projectException(row: Record<string, unknown>) {
  const timestamp = (key: string) =>
    row[key] === null ? null : (row[key] as Date).toISOString();
  return shiftPresenceManagementExceptionSchema.parse({
    exceptionId: row.exceptionId,
    locationId: row.locationId,
    action: row.action,
    shiftId: row.shiftId,
    reason: row.reason,
    status: row.status,
    revision: row.revision,
    requestedAt: timestamp("requestedAt"),
    expiresAt: timestamp("expiresAt"),
    reviewedAt: timestamp("reviewedAt"),
    terminalAt: timestamp("terminalAt"),
    timezone: row.timezone,
    canReview: row.canReview,
    requester: {
      userId: row.requesterUserId,
      membershipId: row.requesterMembershipId,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
    },
  });
}

export async function readManagementPresenceException(
  transaction: PostgresTransaction,
  actor: PresenceManagementActor,
  exceptionId: string,
) {
  const result = await transaction.query(
    `SELECT ${projectionColumns} ${projectionJoin} AND e.id=$4`,
    [actor.organizationId, actor.locationId, actor.userId, exceptionId],
  );
  if (result.rows[0] === undefined) throw new ManagementAccessDeniedError();
  return projectException(result.rows[0]);
}

export async function listManagementPresenceExceptions(
  transaction: PostgresTransaction,
  actor: PresenceManagementActor,
  query: {
    view: "PENDING" | "HISTORY";
    limit: number;
    cursor?: string | undefined;
  },
) {
  const result = await transaction.query(
    `SELECT ${projectionColumns} ${projectionJoin}
    AND ($4::uuid IS NULL OR e.id>$4) AND (($5='PENDING' AND e.status='PENDING') OR ($5='HISTORY' AND e.status<>'PENDING'))
    ORDER BY e.id LIMIT $6`,
    [
      actor.organizationId,
      actor.locationId,
      actor.userId,
      query.cursor ?? null,
      query.view,
      query.limit + 1,
    ],
  );
  const items = result.rows.slice(0, query.limit).map(projectException);
  return {
    items,
    nextCursor:
      result.rows.length > query.limit ? items.at(-1)!.exceptionId : null,
  };
}

export async function reviewManagementPresenceException(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  actor: PresenceManagementActor,
  exceptionId: string,
  command: { expectedRevision: number; mutationId: string },
  action: "APPROVED" | "REJECTED",
) {
  const before = await readManagementPresenceException(
    transaction,
    actor,
    exceptionId,
  );
  if (before.requester.userId === actor.userId)
    throw new ManagementAccessDeniedError();
  if (
    before.status !== "PENDING" ||
    before.revision !== command.expectedRevision
  ) {
    throw new PresenceManagementError("PRESENCE_REVIEW_CONFLICT");
  }
  // Nonblocking second principal proof cannot mistake contention for revoked authority.
  const requester = await transaction.query(
    `SELECT id FROM users WHERE id=$1 AND status='ACTIVE' FOR SHARE NOWAIT`,
    [before.requester.userId],
  );
  const member = await transaction.query<{ status: string; role: string }>(
    `SELECT status::text,role::text FROM organization_memberships
    WHERE id=$1 AND organization_id=$2 AND user_id=$3 FOR SHARE NOWAIT`,
    [
      before.requester.membershipId,
      actor.organizationId,
      before.requester.userId,
    ],
  );
  if (
    requester.rowCount !== 1 ||
    member.rows[0] === undefined ||
    !["VALET_EMPLOYEE", "VALET_SUPERVISOR"].includes(member.rows[0].role)
  )
    throw new ManagementAccessDeniedError();
  if (before.action === "START") {
    const eligible = await transaction.query(
      `SELECT a.location_id FROM membership_location_access a JOIN locations l
      ON l.id=a.location_id AND l.organization_id=a.organization_id AND l.status='ACTIVE'
      WHERE a.organization_id=$1 AND a.location_id=$2 AND a.membership_id=$3 FOR SHARE OF a,l NOWAIT`,
      [actor.organizationId, actor.locationId, before.requester.membershipId],
    );
    if (member.rows[0].status !== "ACTIVE" || eligible.rowCount !== 1)
      throw new ManagementAccessDeniedError();
  } else {
    const shift = await transaction.query(
      `SELECT id FROM shifts WHERE id=$1 AND organization_id=$2 AND location_id=$3
      AND membership_id=$4 AND status='ACTIVE' FOR SHARE NOWAIT`,
      [
        before.shiftId,
        actor.organizationId,
        actor.locationId,
        before.requester.membershipId,
      ],
    );
    if (shift.rowCount !== 1) throw new ManagementAccessDeniedError();
  }
  const operation = await transaction.query<{ id: string; status: string }>(
    `SELECT o.id::text,o.status::text FROM shift_presence_operations o
    JOIN shift_presence_challenges c ON c.operation_row_id=o.id JOIN shift_presence_exceptions e ON e.challenge_id=c.id
    WHERE e.id=$1 AND o.organization_id=$2 AND o.location_id=$3 AND o.user_id=$4 AND o.membership_id=$5
      AND o.action=$6 AND o.shift_id IS NOT DISTINCT FROM $7::uuid FOR UPDATE OF o`,
    [
      exceptionId,
      actor.organizationId,
      actor.locationId,
      before.requester.userId,
      before.requester.membershipId,
      before.action,
      before.shiftId,
    ],
  );
  if (operation.rows[0]?.status !== "PENDING")
    throw new PresenceManagementError("PRESENCE_REVIEW_CONFLICT");
  const challenge = await transaction.query<{
    expires_at: Date;
    consumed_at: Date | null;
  }>(
    `SELECT expires_at,consumed_at FROM shift_presence_challenges WHERE operation_row_id=$1 FOR UPDATE`,
    [operation.rows[0].id],
  );
  const exception = await transaction.query<{
    status: string;
    revision: number;
    expires_at: Date;
  }>(
    `SELECT status::text,revision,expires_at FROM shift_presence_exceptions WHERE id=$1 FOR UPDATE`,
    [exceptionId],
  );
  const now = await transaction.query<{ now: Date }>(
    `SELECT clock_timestamp() AS now`,
  );
  const pending = exception.rows[0];
  if (
    pending?.status !== "PENDING" ||
    pending.revision !== command.expectedRevision ||
    pending.expires_at <= now.rows[0]!.now ||
    challenge.rows[0] === undefined ||
    challenge.rows[0].consumed_at !== null ||
    challenge.rows[0].expires_at <= now.rows[0]!.now
  ) {
    throw new PresenceManagementError("PRESENCE_REVIEW_CONFLICT");
  }
  if (
    (
      await transaction.query(`SELECT id FROM audit_events WHERE id=$1`, [
        command.mutationId,
      ])
    ).rowCount !== 0
  ) {
    throw new PresenceManagementError("PRESENCE_MUTATION_CONFLICT");
  }
  await requireMfaAssuranceInTransaction(transaction, context, {
    sensitive: true,
  });
  await transaction.query(
    `UPDATE shift_presence_exceptions SET status=$2::shift_presence_exception_status,revision=revision+1,
    reviewed_at=clock_timestamp(),reviewer_membership_id=$3,reviewer_user_id=$4,
    terminal_at=CASE WHEN $2::text='REJECTED' THEN clock_timestamp() ELSE NULL END WHERE id=$1`,
    [exceptionId, action, actor.membershipId, actor.userId],
  );
  await appendPresenceManagementAudit(transaction, actor, command.mutationId, {
    eventType:
      action === "APPROVED"
        ? "SHIFT_PRESENCE_EXCEPTION_APPROVED"
        : "SHIFT_PRESENCE_EXCEPTION_REJECTED",
    entityType: "ShiftPresenceException",
    entityId: exceptionId,
    revision: pending.revision + 1,
    state: action,
  });
  return readManagementPresenceException(transaction, actor, exceptionId);
}
