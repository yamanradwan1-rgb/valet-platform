import type { AuditInvestigationSearchQuery } from "@valet/contracts";
import type { PostgresTransaction } from "../../../../common/database/postgres";
import { ManagementAccessDeniedError } from "../../management-authorization";
import type { AuditInvestigationLocationAuthorization } from "../security/audit-investigation-authorization";
import { locationMemberParticipationSql } from "./search-selector-query";

/**
 * Canonical UUIDs supplied by a client are selectors, never authority.
 * Resolve both in EXACT authorized scope before the evidence query, including
 * historically participating INACTIVE membership records (no current grants).
 * Absence and wrong-tenant/Location yield the same non-disclosing denial.
 */
export async function requireCanonicalInvestigationSelectors(
  transaction: PostgresTransaction,
  scope: AuditInvestigationLocationAuthorization,
  query: Pick<AuditInvestigationSearchQuery, "keySlotId" | "membershipId">,
): Promise<void> {
  if (query.keySlotId !== undefined) {
    const slot = await transaction.query(
      `SELECT 1 FROM key_slots
        WHERE id = $3::uuid AND organization_id = $1::uuid AND location_id = $2::uuid`,
      [scope.organizationId, scope.locationId, query.keySlotId],
    );
    if (slot.rows.length !== 1) throw new ManagementAccessDeniedError();
  }
  if (query.membershipId !== undefined) {
    const member = await transaction.query(
      `SELECT 1 FROM organization_memberships member
       WHERE member.id = $3::uuid AND member.organization_id = $1::uuid
         AND ${locationMemberParticipationSql}`,
      [scope.organizationId, scope.locationId, query.membershipId],
    );
    if (member.rows.length !== 1) throw new ManagementAccessDeniedError();
  }
}
