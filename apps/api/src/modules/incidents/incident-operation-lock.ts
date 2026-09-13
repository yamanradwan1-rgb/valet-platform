import type { PostgresTransaction } from "../../common/database/postgres";

export async function lockIncidentOperation(
  transaction: PostgresTransaction,
  organizationId: string,
  incidentId: string,
): Promise<void> {
  await transaction.query(
    `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [`${organizationId}:incident:${incidentId}`],
  );
}
