import type { PostgresTransaction } from "../../../common/database/postgres";
import { requireMfaAssuranceInTransaction } from "../../auth/mfa/mfa-assurance-policy";
import { authorizeManagementAuditLocation } from "../../management/management-audit-authorization";
import type { DashboardLocationScope } from "../dashboard-location-authorization";
import { DashboardOverviewError } from "../dashboard-overview-error";
import {
  requireManagementAlertSourceScope,
  type ManagementAlertReaderInput,
} from "./management-alert-source-contract";

/** Internal source-only occurrence candidate; not a public DTO or Seen receipt. */
export interface CustodyOccurrenceAlertCandidate {
  readonly category: "ALT-05" | "ALT-07";
  readonly severity: "CRITICAL";
  readonly sourceKind:
    | "EMERGENCY_TAKEOVER"
    | "TERMINAL_HANDOFF_FAILURE"
    | "HANDOFF_SUPERVISOR_OVERRIDE";
  readonly sourceId: string;
  readonly organizationId: string;
  readonly locationId: string;
  readonly valetSessionId: string;
  readonly taskId?: string;
  readonly occurredAt: string;
  readonly title: string;
}

function deny(): never {
  throw new DashboardOverviewError("AUTHORIZATION_DENIED");
}

/**
 * Source authority is an additional fence after the protected Dashboard gate.
 * ALT-05 has no proven LM takeover read; ALT-07 uses exact existing location
 * handoff-audit read. No command, general audit, or custody access is granted.
 */
export async function authorizeCustodyOccurrenceAlertSource(
  transaction: PostgresTransaction,
  input: ManagementAlertReaderInput,
  category: CustodyOccurrenceAlertCandidate["category"],
): Promise<DashboardLocationScope> {
  const scope = await requireManagementAlertSourceScope(transaction, input);
  const audit = await authorizeManagementAuditLocation(
    transaction,
    input.context,
    scope.organizationId,
    scope.locationId,
  );
  if (
    audit.membershipId !== scope.membershipId ||
    audit.organizationId !== scope.organizationId ||
    audit.locationId !== scope.locationId ||
    (audit.role !== "ORG_ADMIN" &&
      !(category === "ALT-07" && audit.role === "LOCATION_MANAGER"))
  ) {
    deny();
  }
  // The existing takeover-detail source is a sensitive CA read; unlike the
  // ordinary audit listing, an ALT-05 read must preserve fresh CA MFA.
  if (category === "ALT-05") {
    await requireMfaAssuranceInTransaction(transaction, input.context, {
      sensitive: true,
    });
  }
  return scope;
}
