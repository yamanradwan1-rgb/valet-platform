import type { PostgresTransaction } from "../../../common/database/postgres";
import type { AuditInvestigationLocationAuthorization } from "./security/audit-investigation-authorization";

/** Current Incident authorization/Location state can change between pages.
 * Bind this CURRENT policy state into each viewer-scoped HMAC digest and read
 * it again on continuation. It never grants access and does not claim to be a
 * historical identity snapshot. Authorization still runs for every request.
 */
export async function readU05IncidentPolicy(
  tx: PostgresTransaction,
  scope: AuditInvestigationLocationAuthorization,
): Promise<string> {
  const result = await tx.query<{ readonly status: string }>(
    `SELECT status::text AS status FROM locations
     WHERE organization_id = $1::uuid AND id = $2::uuid
     FOR SHARE`, [scope.organizationId, scope.locationId],
  );
  const status = result.rows[0]?.status;
  if (result.rowCount !== 1 || !status) {
    throw new Error("U05_CURRENT_LOCATION_POLICY_UNAVAILABLE");
  }
  return status;
}
