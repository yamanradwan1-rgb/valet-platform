import {
  emergencyTakeoverContextResponseSchema,
  type EmergencyTakeoverContextResponse,
} from "@valet/contracts";
import type { PostgresPool, PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import {
  sessionResourceColumns,
  sessionResourceJoins,
} from "../dashboard/session-resource-projection";
import { authorizeEmergencyTakeoverRead } from "./emergency-task-takeover.authority";
import type { EmergencyTakeoverReadAuthority } from "./emergency-task-takeover.authority";
import { inDispatchTransaction } from "./dispatch-transaction";

interface CandidateRow {
  readonly membershipId: string;
  readonly identity: {
    readonly email: string;
    readonly firstName: string | null;
    readonly lastName: string | null;
  };
}

interface CustodyRow {
  readonly eventId: string;
  readonly eventType: string;
  readonly actorMembershipId: string;
  readonly keySlotId: string | null;
  readonly occurredAt: Date;
}

interface TakeoverRow {
  readonly eventId: string;
  readonly actorMembershipId: string | null;
  readonly fromAssigneeMembershipId: string | null;
  readonly toAssigneeMembershipId: string;
  readonly occurredAt: Date;
}

async function canInitiateEmergencyTakeover(
  transaction: PostgresTransaction,
  authority: EmergencyTakeoverReadAuthority,
): Promise<boolean> {
  // UI visibility is advisory. W2 independently re-proves these facts with
  // protected locks at the write boundary, including custody/proof guards.
  // W1's domain contract rejects a Task with no canonical current owner.
  if (authority.assigneeMembershipId === null) return false;
  if (authority.taskType === "PARKING") {
    return authority.sessionState === "PARKING";
  }
  if (
    authority.sessionState !== "RETRIEVING" &&
    authority.sessionState !== "READY" &&
    authority.sessionState !== "HANDOFF_PENDING"
  ) {
    return false;
  }
  const accepted = await transaction.query(
    `SELECT 1 FROM retrieval_requests
     WHERE organization_id = $1 AND valet_session_id = $2
       AND status = 'ACCEPTED'
     LIMIT 1`,
    [authority.organizationId, authority.sessionId],
  );
  return accepted.rowCount === 1;
}

async function readEligibleAssignees(
  transaction: PostgresTransaction,
  organizationId: string,
  locationId: string,
  currentAssigneeMembershipId: string | null,
  search: string,
) {
  const result = await transaction.query<CandidateRow>(
    `SELECT membership.id::text AS "membershipId",
            jsonb_build_object(
              'email', staff_user.email,
              'firstName', membership.first_name,
              'lastName', membership.last_name
            ) AS identity
     FROM organization_memberships AS membership
     INNER JOIN users AS staff_user
       ON staff_user.id = membership.user_id
      AND staff_user.status = 'ACTIVE'
     WHERE membership.organization_id = $1
       AND membership.status = 'ACTIVE'
       AND membership.role IN ('VALET_EMPLOYEE','VALET_SUPERVISOR')
       AND membership.id IS DISTINCT FROM $3::uuid
       AND ($4::text = ''
         OR strpos(lower(concat_ws(' ', membership.first_name, membership.last_name)),
                   lower($4)) > 0
         OR strpos(lower(staff_user.email), lower($4)) > 0)
       AND EXISTS (
         SELECT 1 FROM membership_location_access AS access
         WHERE access.organization_id = membership.organization_id
           AND access.membership_id = membership.id
           AND access.location_id = $2
       )
       AND EXISTS (
         SELECT 1 FROM shifts AS shift_row
         WHERE shift_row.organization_id = membership.organization_id
           AND shift_row.membership_id = membership.id
           AND shift_row.location_id = $2
           AND shift_row.status = 'ACTIVE'
       )
     ORDER BY membership.last_name NULLS LAST,
              membership.first_name NULLS LAST, membership.id
     LIMIT 51`,
    [organizationId, locationId, currentAssigneeMembershipId, search],
  );
  return {
    eligibleAssignees: result.rows.slice(0, 50),
    hasMoreEligibleAssignees: result.rows.length > 50,
  };
}

async function readCustodyEvents(
  transaction: PostgresTransaction,
  organizationId: string,
  locationId: string,
  sessionId: string,
) {
  const result = await transaction.query<CustodyRow>(
    `SELECT id::text AS "eventId", event_type::text AS "eventType",
            actor_membership_id::text AS "actorMembershipId",
            key_slot_id::text AS "keySlotId", occurred_at AS "occurredAt"
     FROM key_custody_events
     WHERE organization_id = $1 AND location_id = $2 AND valet_session_id = $3
     -- Source transaction order is authoritative across equal timestamps.
     -- DEC-068 writes SLOT_ASSIGNED then RETURNED_TO_SLOT with the exact
     -- same operation time and transaction XID; their UUIDs are random.
     ORDER BY occurred_at DESC, pagination_birth_xid DESC NULLS LAST,
       CASE event_type
         WHEN 'RELEASED' THEN 5
         WHEN 'CHECKED_OUT' THEN 4
         WHEN 'RETURNED_TO_SLOT' THEN 3
         WHEN 'SLOT_ASSIGNED' THEN 2
         WHEN 'SLOT_CLEARED' THEN 1
         ELSE 0
       END DESC, id DESC
     LIMIT 10`,
    [organizationId, locationId, sessionId],
  );
  return result.rows.map((event) => ({
    ...event,
    occurredAt: event.occurredAt.toISOString(),
  }));
}

async function readTakeoverEvents(
  transaction: PostgresTransaction,
  organizationId: string,
  locationId: string,
  taskId: string,
) {
  const result = await transaction.query<TakeoverRow>(
    `SELECT id::text AS "eventId",
            actor_membership_id::text AS "actorMembershipId",
            previous_assignee_membership_id::text AS "fromAssigneeMembershipId",
            new_assignee_membership_id::text AS "toAssigneeMembershipId",
            occurred_at AS "occurredAt"
     FROM dispatch_events
     WHERE organization_id = $1 AND location_id = $2 AND task_id = $3
       AND event_type::text = 'EMERGENCY_TAKEOVER'
     ORDER BY occurred_at DESC, id DESC LIMIT 10`,
    [organizationId, locationId, taskId],
  );
  return result.rows.map((event) => ({
    ...event,
    occurredAt: event.occurredAt.toISOString(),
  }));
}

export async function readEmergencyTakeoverContext(
  pool: PostgresPool,
  input: {
    readonly taskId: string;
    readonly staffSessionContext: StaffSessionContext;
    readonly search?: string;
  },
): Promise<EmergencyTakeoverContextResponse> {
  return inDispatchTransaction(pool, async (transaction) => {
    const authority = await authorizeEmergencyTakeoverRead(
      transaction,
      input.staffSessionContext,
      input.taskId,
    );
    const resources = await transaction.query<{
      readonly keySlot: unknown;
      readonly parkingSpot: unknown;
      readonly parkingZone: unknown;
      readonly vehicle: unknown;
      readonly currentAssignee: unknown;
    }>(
      `SELECT ${sessionResourceColumns},
         jsonb_build_object(
           'id', vehicle.id,
           'licensePlate', vehicle.plate_number_raw,
           'descriptor', vehicle.temporary_descriptor
         ) AS vehicle,
         CASE WHEN assignee.id IS NULL THEN NULL ELSE jsonb_build_object(
           'membershipId', assignee.id,
           'identity', jsonb_build_object(
             'email', assignee_user.email,
             'firstName', assignee.first_name,
             'lastName', assignee.last_name
           )
         ) END AS "currentAssignee"
       FROM valet_sessions AS session
       ${sessionResourceJoins}
       INNER JOIN vehicles AS vehicle
         ON vehicle.id = session.vehicle_id
        AND vehicle.organization_id = session.organization_id
       LEFT JOIN organization_memberships AS assignee
         ON assignee.id = $4::uuid
        AND assignee.organization_id = session.organization_id
       LEFT JOIN users AS assignee_user ON assignee_user.id = assignee.user_id
       WHERE session.id = $1
         AND session.organization_id = $2 AND session.location_id = $3`,
      [authority.sessionId, authority.organizationId, authority.locationId,
        authority.assigneeMembershipId],
    );
    const located = resources.rows[0];
    // An authorized Task must not be projected with detached resource scope.
    if (!located || resources.rowCount !== 1) {
      throw new Error("Authorized Task has no matching scoped ValetSession.");
    }
    const [canInitiate, candidates, recentCustodyEvents, recentTakeovers] = await Promise.all([
      canInitiateEmergencyTakeover(transaction, authority),
      readEligibleAssignees(transaction, authority.organizationId,
        authority.locationId, authority.assigneeMembershipId,
        input.search ?? ""),
      readCustodyEvents(transaction, authority.organizationId,
        authority.locationId, authority.sessionId),
      readTakeoverEvents(transaction, authority.organizationId,
        authority.locationId, authority.taskId),
    ]);
    return emergencyTakeoverContextResponseSchema.parse({
      canInitiate,
      task: {
        id: authority.taskId,
        taskType: authority.taskType,
        status: authority.status,
        version: authority.version,
        assigneeMembershipId: authority.assigneeMembershipId,
        sessionId: authority.sessionId,
        sessionState: authority.sessionState,
      },
      resources: {
        keySlot: located.keySlot,
        parkingSpot: located.parkingSpot,
        parkingZone: located.parkingZone,
      },
      vehicle: located.vehicle,
      currentAssignee: located.currentAssignee,
      custody: recentCustodyEvents.length === 0
        ? {
            source: "NONE",
            latestKeyEventType: null,
            latestKeyEventActorMembershipId: null,
            occurredAt: null,
          }
        : {
            source: "RECORDED",
            latestKeyEventType: recentCustodyEvents[0]?.eventType ?? null,
            latestKeyEventActorMembershipId:
              recentCustodyEvents[0]?.actorMembershipId ?? null,
            occurredAt: recentCustodyEvents[0]?.occurredAt ?? null,
          },
      ...candidates,
      recentCustodyEvents,
      recentTakeovers,
    });
  });
}
