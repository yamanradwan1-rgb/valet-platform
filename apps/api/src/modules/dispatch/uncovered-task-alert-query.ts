import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import type { DashboardLocationScope } from "../dashboard/dashboard-location-authorization";

/** Supply this scope only after current Dashboard Location authorization/MFA. */
export interface AuthorizedUncoveredTaskAlertScope {
  readonly organizationId: string;
  readonly locationId: string;
  readonly viewerUserId: string;
  readonly viewerMembershipId: string;
  readonly initialQueueDelaySeconds: number;
  readonly postDeclineDelaySeconds: number;
  /** DB-server cutover captured only after every old writer is quiesced. */
  readonly postLockClockCutover: Date;
  readonly limit: number;
}

export interface UncoveredTaskAlert {
  readonly category: "ALT-02" | "ALT-03";
  readonly severity: "IMPORTANT";
  readonly sourceKind: "TASK";
  readonly sourceId: string;
  readonly episodeId: string;
  readonly organizationId: string;
  readonly locationId: string;
  readonly occurredAt: string;
  readonly title: string;
}

interface UncoveredTaskAlertRow {
  readonly category: "ALT-02" | "ALT-03";
  readonly sourceId: string;
  readonly episodeId: string;
  readonly occurredAt: Date;
  readonly taskType: "PARKING" | "RETRIEVAL";
}

function requireQueryBoundaries(
  scope: AuthorizedUncoveredTaskAlertScope,
): void {
  if (
    !Number.isSafeInteger(scope.limit) ||
    scope.limit < 1 ||
    scope.limit > 21 ||
    !Number.isSafeInteger(scope.initialQueueDelaySeconds) ||
    scope.initialQueueDelaySeconds < 0 ||
    scope.initialQueueDelaySeconds > 300 ||
    !Number.isSafeInteger(scope.postDeclineDelaySeconds) ||
    scope.postDeclineDelaySeconds < 0 ||
    scope.postDeclineDelaySeconds > 120 ||
    !(scope.postLockClockCutover instanceof Date) ||
    !Number.isFinite(scope.postLockClockCutover.getTime())
  ) {
    throw new Error("Invalid bounded Dispatch alert query parameters.");
  }
}

async function queryCurrentUncoveredTaskAlerts(
  tx: PostgresTransaction,
  scope: AuthorizedUncoveredTaskAlertScope,
  exactTaskId: string | null,
  limit: number,
): Promise<UncoveredTaskAlert[]> {
  requireQueryBoundaries(scope);
  const result = await tx.query<UncoveredTaskAlertRow>(
    `WITH eligible_viewer AS (
       SELECT 1
       FROM users AS person
       INNER JOIN organization_memberships AS membership
         ON membership.user_id=person.id
        AND membership.id=$4 AND membership.organization_id=$1
        AND membership.status='ACTIVE'
       INNER JOIN organizations AS organization
         ON organization.id=membership.organization_id
        AND organization.status='ACTIVE'
       INNER JOIN locations AS location
         ON location.id=$2 AND location.organization_id=organization.id
        AND location.status='ACTIVE'
       WHERE person.id=$3 AND person.status='ACTIVE'
         AND (
           membership.role='ORG_ADMIN'
           OR (membership.role='LOCATION_MANAGER' AND EXISTS (
             SELECT 1 FROM membership_location_access AS access
             WHERE access.organization_id=$1
               AND access.membership_id=membership.id
               AND access.location_id=location.id
           ))
         )
     ),
     candidate AS (
       SELECT task.id, task.organization_id, task.location_id,
              task.valet_session_id, task.task_type, task.version,
              task.created_at
       FROM tasks AS task
       INNER JOIN valet_sessions AS session
         ON session.id=task.valet_session_id
        AND session.organization_id=task.organization_id
        AND session.location_id=task.location_id
       WHERE task.organization_id=$1 AND task.location_id=$2
         AND task.status='QUEUED'
         AND task.current_assignee_membership_id IS NULL
         AND ((task.task_type='PARKING' AND session.state='AWAITING_PARKING')
              OR (task.task_type='RETRIEVAL' AND session.state='REQUESTED'))
         AND task.version >= 1
         AND ($7::uuid IS NULL OR task.id=$7::uuid)
         AND EXISTS (SELECT 1 FROM eligible_viewer)
     ),
     proven AS (
       SELECT task.*,
              CASE WHEN task.version=1 THEN initial.occurred_at
                   ELSE decline.occurred_at END AS occurred_at,
              CASE WHEN task.version=1 THEN 'ALT-02'
                   ELSE 'ALT-03' END AS category
       FROM candidate AS task
       LEFT JOIN LATERAL (
         SELECT count(*)::integer AS total,
                count(*) FILTER (WHERE event_type='QUEUED')::integer AS queued,
                min(occurred_at) AS occurred_at
         FROM dispatch_events AS event
         WHERE event.organization_id=task.organization_id
           AND event.location_id=task.location_id
           AND event.task_id=task.id
       ) AS initial ON task.version=1
       LEFT JOIN LATERAL (
         SELECT count(*)::integer AS total,
                count(*) FILTER (
                  WHERE audit.event_type='TASK_DECLINED'
                    AND audit.metadata_json->>'fromVersion'=(task.version-1)::text
                    AND audit.metadata_json->>'fromStatus'='ASSIGNED'
                    AND audit.metadata_json->>'toStatus'='QUEUED'
                    AND audit.metadata_json->>'sessionId'=task.valet_session_id::text
                    AND jsonb_typeof(audit.metadata_json->'toVersion')='number'
                )::integer AS valid,
                min(audit.occurred_at) AS occurred_at,
                min(audit.actor_membership_id::text) AS actor_id,
                min(audit.metadata_json->>'previousAssigneeMembershipId')
                  AS previous_assignee_id
         FROM audit_events AS audit
         WHERE audit.organization_id=task.organization_id
           AND audit.location_id=task.location_id
           AND audit.valet_session_id=task.valet_session_id
           AND audit.entity_type='Task' AND audit.entity_id=task.id
           AND audit.metadata_json->>'toVersion'=task.version::text
       ) AS decline ON task.version > 1
       LEFT JOIN LATERAL (
         SELECT count(*)::integer AS matched
         FROM dispatch_events AS event
         WHERE event.organization_id=task.organization_id
           AND event.location_id=task.location_id
           AND event.task_id=task.id
           AND event.event_type='DECLINED'
           AND event.occurred_at=decline.occurred_at
           AND event.actor_membership_id::text=decline.actor_id
           AND event.previous_assignee_membership_id::text=
               decline.previous_assignee_id
           AND event.new_assignee_membership_id IS NULL
       ) AS event_proof ON task.version > 1
       WHERE (task.version=1 AND initial.total=1 AND initial.queued=1
              AND initial.occurred_at=task.created_at)
          OR (task.version>1 AND decline.total=1 AND decline.valid=1
              AND decline.actor_id IS NOT NULL
              AND decline.previous_assignee_id IS NOT NULL
              AND event_proof.matched=1)
     )
     SELECT proven.id::text AS "sourceId",
            proven.id::text || ':' || proven.version::text AS "episodeId",
            proven.task_type::text AS "taskType",
            proven.category,
            proven.occurred_at AS "occurredAt"
     FROM proven
     WHERE proven.occurred_at IS NOT NULL
       AND proven.occurred_at > $9::timestamptz
       AND clock_timestamp() > proven.occurred_at
         + (CASE WHEN proven.version=1 THEN $5::integer ELSE $6::integer END)
             * interval '1 second'
     ORDER BY proven.occurred_at DESC, proven.id DESC
     LIMIT $8`,
    [
      scope.organizationId,
      scope.locationId,
      scope.viewerUserId,
      scope.viewerMembershipId,
      scope.initialQueueDelaySeconds,
      scope.postDeclineDelaySeconds,
      exactTaskId,
      limit,
      scope.postLockClockCutover,
    ],
  );
  return result.rows.map((row) => ({
    category: row.category,
    severity: "IMPORTANT",
    sourceKind: "TASK",
    sourceId: row.sourceId,
    episodeId: row.episodeId,
    organizationId: scope.organizationId,
    locationId: scope.locationId,
    occurredAt: row.occurredAt.toISOString(),
    title:
      row.taskType === "PARKING"
        ? "Unassigned parking task"
        : "Unassigned retrieval task",
  }));
}

/** This reader never changes a Task/ValetSession or creates an alert receipt. */
export function readCurrentUncoveredTaskAlerts(
  tx: PostgresTransaction,
  scope: AuthorizedUncoveredTaskAlertScope,
): Promise<UncoveredTaskAlert[]> {
  return queryCurrentUncoveredTaskAlerts(tx, scope, null, scope.limit);
}

/** Phase-1 source facade consumed only after current CA/LM source authorization. */
export function queryUncoveredTaskAlertCases(
  tx: PostgresTransaction,
  input: {
    readonly context: StaffSessionContext;
    readonly scope: DashboardLocationScope;
    readonly limit: number;
    readonly initialQueueDelaySeconds: number;
    readonly postDeclineDelaySeconds: number;
    readonly postLockClockCutover: Date;
  },
): Promise<UncoveredTaskAlert[]> {
  return readCurrentUncoveredTaskAlerts(tx, {
    organizationId: input.scope.organizationId,
    locationId: input.scope.locationId,
    viewerUserId: input.context.userId,
    viewerMembershipId: input.scope.membershipId,
    limit: input.limit,
    initialQueueDelaySeconds: input.initialQueueDelaySeconds,
    postDeclineDelaySeconds: input.postDeclineDelaySeconds,
    postLockClockCutover: input.postLockClockCutover,
  });
}

/** Exact source detail must repeat fresh Dashboard authorization in the caller. */
export async function readCurrentUncoveredTaskAlertById(
  tx: PostgresTransaction,
  scope: AuthorizedUncoveredTaskAlertScope,
  taskId: string,
): Promise<UncoveredTaskAlert | null> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      taskId,
    )
  )
    return null;
  return (
    (await queryCurrentUncoveredTaskAlerts(tx, scope, taskId, 1))[0] ?? null
  );
}

/** Protect a historic alert link from opening a different, newer Task episode. */
export async function readCurrentUncoveredTaskAlertEpisode(
  tx: PostgresTransaction,
  scope: AuthorizedUncoveredTaskAlertScope,
  taskId: string,
  episodeId: string,
): Promise<UncoveredTaskAlert | null> {
  if (!episodeId.startsWith(`${taskId}:`)) return null;
  const current = await readCurrentUncoveredTaskAlertById(tx, scope, taskId);
  return current?.episodeId === episodeId ? current : null;
}
