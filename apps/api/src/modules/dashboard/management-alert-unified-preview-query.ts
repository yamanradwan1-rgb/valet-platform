import type { ManagementAlertUnifiedPreviewResponse } from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { correlateManagementAlertUnifiedPreview } from "./management-alert-unified-correlation";
import { projectPhaseOneAlert } from "./management-alert-unified-projection";
import { queryUnifiedCoreSources } from "./management-alert-unified-sources-core";
import { queryPhaseOneManagementAlertCases } from "./management-alert-preview-query";

const sourceLimit = 21;

/**
 * All readers run under one current Staff session and database transaction.
 * Each source independently proves current authority BEFORE its candidate LIMIT.
 * An unavailable source rejects the whole preview, never returns a false zero.
 */
export function listUnifiedManagementAlertPreview(
  pool: PostgresPool,
  input: { readonly context: StaffSessionContext; readonly locationId: string },
): Promise<ManagementAlertUnifiedPreviewResponse> {
  return inPostgresTransaction(pool, async (tx) => {
    const {
      scope,
      cases: phaseOne,
      timing,
    } = await queryPhaseOneManagementAlertCases(tx, input);
    const readerInput = { context: input.context, scope, limit: sourceLimit };
    const company = await tx.query(
      "SELECT 1 FROM organization_memberships AS membership " +
        "WHERE membership.id=$1::uuid AND membership.organization_id=$2::uuid " +
        "AND membership.user_id=$3::uuid AND membership.status='ACTIVE' " +
        "AND membership.role='ORG_ADMIN'",
      [scope.membershipId, scope.organizationId, input.context.userId],
    );
    const allowCompanyAdmin = company.rowCount === 1;
    const core = await queryUnifiedCoreSources(tx, {
      ...readerInput,
      allowCompanyAdmin,
      unknownDelaySeconds: timing.alt11UnknownPaymentSeconds,
      stageDelaySeconds: timing.alt04StageSeconds,
      handoffDelaySeconds: timing.alt06HandoffSeconds,
      alt01GraceSeconds: timing.alt01GraceSeconds,
    });
    return correlateManagementAlertUnifiedPreview(
      [...phaseOne.map(projectPhaseOneAlert), ...core],
      {
        organizationId: scope.organizationId,
        locationId: scope.locationId,
        allowOrganizationOnly: allowCompanyAdmin,
      },
    );
  });
}
