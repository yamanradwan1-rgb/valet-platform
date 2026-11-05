import type { PostgresTransaction } from "../../../common/database/postgres";
import { requireFinancialAlertSourceScope } from "./financial-alert-source-authorization";
import { requireManagementAlertSourceId } from "./management-alert-source-contract";
import type {
  FinancialAlertExactReaderInput,
  FinancialAlertReaderInput,
  FinancialAlertSourceCase,
  FinancialAlertSourceRow,
} from "./financial-alert-source-types";

/**
 * One SQL statement means a callback commit cannot appear between ALT-11 and
 * ALT-10 reads. In particular, unresolved operations suppress an older FAILED
 * state BEFORE the viewer-specific warning delay crosses.
 */
const financialSourceSql = `WITH now_at AS MATERIALIZED (SELECT clock_timestamp() AS at),
  unresolved AS MATERIALIZED (
    SELECT 'ALT-11'::text AS category,
           payment.id::text AS "paymentId",
           operation.id::text AS "operationId",
           payment.valet_session_id::text AS "valetSessionId",
           operation.dispatch_guarded_at AS "sourceAt"
    FROM payment_collection_operations AS operation
    JOIN payments AS payment
      ON payment.organization_id = operation.organization_id
     AND payment.id = operation.payment_id
    JOIN valet_sessions AS session
      ON session.organization_id = payment.organization_id
     AND session.location_id = payment.location_id
     AND session.id = payment.valet_session_id
    CROSS JOIN now_at
    WHERE payment.organization_id = $1 AND payment.location_id = $2
      AND ($5::uuid IS NULL OR payment.id = $5::uuid)
      AND ($6::text IS NULL OR $6::text = 'ALT-11')
      AND payment.collection_method = 'DIGITAL'
      AND payment.status IN ('UNPAID', 'FAILED')
      AND payment.amount_paid = 0 AND payment.paid_at IS NULL
      AND payment.provider = operation.provider
      AND operation.state IN ('OUTCOME_UNKNOWN', 'REFERENCE_ATTACHED')
      AND operation.dispatch_guarded_at IS NOT NULL
      AND operation.resolved_at IS NULL
      AND now_at.at > operation.dispatch_guarded_at
        + $3::integer * INTERVAL '1 second'
    ORDER BY operation.dispatch_guarded_at DESC, operation.id DESC
    LIMIT $4
  ),
  failed AS MATERIALIZED (
    SELECT 'ALT-10'::text AS category,
           payment.id::text AS "paymentId",
           operation.id::text AS "operationId",
           payment.valet_session_id::text AS "valetSessionId",
           evidence.occurred_at AS "sourceAt"
    FROM payments AS payment
    JOIN valet_sessions AS session
      ON session.organization_id = payment.organization_id
     AND session.location_id = payment.location_id
     AND session.id = payment.valet_session_id
    JOIN payment_collection_operations AS operation
      ON operation.organization_id = payment.organization_id
     AND operation.payment_id = payment.id
     AND operation.provider = payment.provider
     AND operation.provider_reference = payment.provider_reference
     AND operation.state = 'RESOLVED'
    JOIN audit_events AS evidence
      ON evidence.organization_id = payment.organization_id
     AND evidence.location_id = payment.location_id
     AND evidence.valet_session_id = payment.valet_session_id
     AND evidence.entity_type = 'PaymentCollectionOperation'
     AND evidence.entity_id = operation.id
     AND evidence.actor_type = 'EXTERNAL_PROVIDER'
     AND evidence.event_type = 'PROVIDER_EVENT_COLLECTION_FAILED'
     AND evidence.metadata_json ->> 'payment_id' = payment.id::text
     AND evidence.metadata_json ->> 'operation_id' = operation.id::text
     AND evidence.metadata_json ->> 'result_kind' = 'COLLECTION_FAILED'
    WHERE payment.organization_id = $1 AND payment.location_id = $2
      AND ($5::uuid IS NULL OR payment.id = $5::uuid)
      AND ($6::text IS NULL OR $6::text = 'ALT-10')
      AND payment.collection_method = 'DIGITAL' AND payment.status = 'FAILED'
      AND payment.amount_paid = 0 AND payment.paid_at IS NULL
      AND payment.provider IS NOT NULL AND payment.provider_reference IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM payment_collection_operations AS pending
        WHERE pending.organization_id = payment.organization_id
          AND pending.payment_id = payment.id
          AND pending.state IN ('PREPARED', 'OUTCOME_UNKNOWN', 'REFERENCE_ATTACHED')
      )
    ORDER BY evidence.occurred_at DESC, operation.id DESC
    LIMIT $4
  )
SELECT * FROM (
  SELECT * FROM unresolved UNION ALL SELECT * FROM failed
) AS eligible
ORDER BY eligible."sourceAt" DESC, eligible.category ASC,
         eligible."operationId" DESC
LIMIT $4`;

interface ClassifiedRow extends FinancialAlertSourceRow {
  readonly category: FinancialAlertSourceCase["category"];
}

function candidate(
  row: ClassifiedRow,
  scope: { readonly organizationId: string; readonly locationId: string },
): FinancialAlertSourceCase {
  return {
    category: row.category,
    severity: "IMPORTANT",
    sourceKind: "PAYMENT",
    sourceId: row.paymentId,
    episodeId: row.operationId,
    organizationId: scope.organizationId,
    locationId: scope.locationId,
    occurredAt: row.sourceAt.toISOString(),
    title:
      row.category === "ALT-10"
        ? "Payment failed"
        : "Payment outcome unconfirmed",
  };
}

async function sourceCandidates(
  transaction: PostgresTransaction,
  input: FinancialAlertReaderInput,
  category?: FinancialAlertSourceCase["category"],
  sourceId?: string,
) {
  if (
    !Number.isInteger(input.unknownDelaySeconds) ||
    input.unknownDelaySeconds < 60 ||
    input.unknownDelaySeconds > 600
  ) {
    throw new RangeError("ALT-11 delay is outside accepted bounds.");
  }
  const scope = await requireFinancialAlertSourceScope(transaction, input);
  const { rows } = await transaction.query<ClassifiedRow>(financialSourceSql, [
    scope.organizationId,
    scope.locationId,
    input.unknownDelaySeconds,
    input.limit,
    sourceId ?? null,
    category ?? null,
  ]);
  return rows.map((row) => ({
    alert: candidate(row, scope),
    valetSessionId: row.valetSessionId,
  }));
}

/** Use one READ COMMITTED transaction for current authority and source queries. */
export async function queryFinancialAlertCases(
  transaction: PostgresTransaction,
  input: FinancialAlertReaderInput,
): Promise<FinancialAlertSourceCase[]> {
  return (await sourceCandidates(transaction, input)).map((row) => row.alert);
}

/** Exact per-Payment/operation episode query, never paginated-preview lookup. */
export async function findFinancialAlertCaseById(
  transaction: PostgresTransaction,
  input: FinancialAlertExactReaderInput,
): Promise<
  (FinancialAlertSourceCase & { readonly valetSessionId: string }) | null
> {
  requireManagementAlertSourceId(input.sourceId);
  requireManagementAlertSourceId(input.episodeId);
  const match = (
    await sourceCandidates(
      transaction,
      {
        context: input.context,
        scope: input.scope,
        limit: 1,
        unknownDelaySeconds: input.unknownDelaySeconds,
      },
      input.category,
      input.sourceId,
    )
  ).find((row) => row.alert.episodeId === input.episodeId);
  return match === undefined
    ? null
    : { ...match.alert, valetSessionId: match.valetSessionId };
}
