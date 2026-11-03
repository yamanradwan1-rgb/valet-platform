import type { PostgresTransaction } from "../../../common/database/postgres";
import {
  requireManagementAlertSourceId,
  requireManagementAlertSourceScope,
  type ManagementAlertExactReaderInput,
  type ManagementAlertReaderInput,
  type ManagementAlertSourceCase,
} from "./management-alert-source-contract";

interface RetrievalSlaAlertRow {
  readonly requestId: string;
  readonly requestedAt: Date;
  readonly valetSessionId: string;
}

async function sourceCandidates(
  transaction: PostgresTransaction,
  input: ManagementAlertReaderInput & { readonly graceSeconds: number },
  sourceId?: string,
) {
  if (
    !Number.isInteger(input.graceSeconds) ||
    input.graceSeconds < 0 ||
    input.graceSeconds > 60
  ) {
    throw new RangeError("ALT-01 grace is outside accepted bounds.");
  }
  const scope = await requireManagementAlertSourceScope(transaction, input);
  const exactPredicate =
    sourceId === undefined ? "" : "AND request.id=$5::uuid";
  const rows = await transaction.query<RetrievalSlaAlertRow>(
    `WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS at)
     SELECT request.id::text AS "requestId",
            session.id::text AS "valetSessionId",
            request.requested_at AS "requestedAt"
     FROM retrieval_requests AS request
     JOIN valet_sessions AS session
       ON session.organization_id = request.organization_id
      AND session.id = request.valet_session_id
     CROSS JOIN instant
     WHERE request.organization_id = $1
       AND session.organization_id = $1
       AND session.location_id = $2
       AND (
         (session.state='REQUESTED' AND request.status='OPEN')
         OR (session.state='RETRIEVING' AND request.status='ACCEPTED')
       )
       AND request.requested_at = session.retrieval_requested_at
       AND request.sla_target_seconds_snapshot IS NOT NULL
       AND instant.at > request.requested_at
         + (request.sla_target_seconds_snapshot + $3::integer)
           * INTERVAL '1 second'
       ${exactPredicate}
     ORDER BY request.requested_at DESC, request.id DESC
     LIMIT $4`,
    [
      scope.organizationId,
      scope.locationId,
      input.graceSeconds,
      input.limit,
      ...(sourceId === undefined ? [] : [sourceId]),
    ],
  );
  return rows.rows.map((row) => ({
    alert: {
      category: "ALT-01",
      severity: "CRITICAL",
      sourceKind: "RETRIEVAL",
      sourceId: row.requestId,
      episodeId: row.requestId,
      organizationId: scope.organizationId,
      locationId: scope.locationId,
      occurredAt: row.requestedAt.toISOString(),
      title: "Retrieval SLA exceeded",
    } satisfies ManagementAlertSourceCase,
    valetSessionId: row.valetSessionId,
  }));
}

/** ALT-01: only the live covered attempt, past the immutable SLA plus own grace. */
export async function queryRetrievalSlaAlertCases(
  transaction: PostgresTransaction,
  input: ManagementAlertReaderInput & { readonly graceSeconds: number },
): Promise<ManagementAlertSourceCase[]> {
  return (await sourceCandidates(transaction, input)).map((row) => row.alert);
}

/** Exact authorized current attempt; only detail receives its Session navigation ID. */
export async function findRetrievalSlaAlertCaseById(
  transaction: PostgresTransaction,
  input: ManagementAlertExactReaderInput & { readonly graceSeconds: number },
): Promise<
  (ManagementAlertSourceCase & { readonly valetSessionId: string }) | null
> {
  requireManagementAlertSourceId(input.sourceId);
  const [match] = await sourceCandidates(
    transaction,
    {
      context: input.context,
      scope: input.scope,
      limit: 1,
      graceSeconds: input.graceSeconds,
    },
    input.sourceId,
  );
  return match === undefined
    ? null
    : { ...match.alert, valetSessionId: match.valetSessionId };
}
