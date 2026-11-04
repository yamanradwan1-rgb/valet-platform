import type { PostgresTransaction } from "../../../common/database/postgres";
import {
  requireManagementAlertSourceId,
  requireManagementAlertSourceScope,
  type ManagementAlertExactReaderInput,
  type ManagementAlertReaderInput,
} from "./management-alert-source-contract";

export interface LocationIntakeStoppedAlertCase {
  readonly category: "ALT-16";
  readonly severity: "IMPORTANT";
  readonly sourceKind: "LOCATION";
  readonly sourceId: string;
  readonly organizationId: string;
  readonly locationId: string;
  readonly title: "Location intake stopped";
}

/**
 * OD-08F: live Location condition only. No event replay, stopped-since clock,
 * Seen receipt, or writes; the caller must separately integrate the approved
 * category into preview/detail contracts after source-review.
 */
export async function queryLocationIntakeStoppedAlertCases(
  transaction: PostgresTransaction,
  input: ManagementAlertReaderInput,
): Promise<LocationIntakeStoppedAlertCase[]> {
  // This guard revalidates Staff session, CA/LM active exact Location grant,
  // commercial Dashboard entitlement and MFA before even probing the row.
  const scope = await requireManagementAlertSourceScope(transaction, input);
  const result = await transaction.query<{ readonly locationId: string }>(
    `SELECT location.id::text AS "locationId"
     FROM locations AS location
     WHERE location.organization_id = $1
       AND location.id = $2
       AND location.status = 'ACTIVE'
       AND location.accepting_intake = FALSE
     LIMIT 1`,
    [scope.organizationId, scope.locationId],
  );
  return result.rows.map((row) => ({
    category: "ALT-16",
    severity: "IMPORTANT",
    sourceKind: "LOCATION",
    sourceId: row.locationId,
    organizationId: scope.organizationId,
    locationId: row.locationId,
    title: "Location intake stopped",
  }));
}

/** Exact current-state lookup; a historical stop is never a valid deep link. */
export async function findLocationIntakeStoppedAlertCaseById(
  transaction: PostgresTransaction,
  input: ManagementAlertExactReaderInput,
): Promise<LocationIntakeStoppedAlertCase | null> {
  requireManagementAlertSourceId(input.sourceId);
  // Authorize even when the supplied ID differs from the selected Location.
  const cases = await queryLocationIntakeStoppedAlertCases(transaction, {
    context: input.context,
    scope: input.scope,
    limit: 1,
  });
  return cases.find((item) => item.sourceId === input.sourceId) ?? null;
}
