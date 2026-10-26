import type {
  StaffShiftHistoryEntry,
  StaffShiftCashReconciliation,
} from "@valet/contracts";
import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizeDashboardLocation } from "../dashboard/dashboard-location-authorization";
import {
  authorizeCompanyAdminManagement,
  ManagementAccessDeniedError,
} from "./management-authorization";
import type { StaffManagementAuthority } from "./staff-management-authorization";

interface CashRow {
  cashExpected: string | null;
  cashReported: string | null;
  cashVariance: string | null;
  currency: string | null;
  reportedAt: Date | null;
  reportedBy: string | null;
}

/** DEC-051/052/060/080 financial reporting authority, separate from Shift listing. */
export async function readShiftCashReconciliation(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  authority: StaffManagementAuthority,
  shift: StaffShiftHistoryEntry,
): Promise<StaffShiftCashReconciliation> {
  if (authority.kind === "COMPANY_ADMIN") {
    await authorizeCompanyAdminManagement(transaction, context, {
      organizationId: authority.organizationId,
      capability: "REPORTS_READ",
      assurance: "STANDARD",
      targetLocationId: shift.location.locationId,
      requireActiveLocation: false,
    });
  } else {
    const financialScope = await authorizeDashboardLocation(
      transaction,
      context.userId,
      shift.location.locationId,
    );
    if (
      !financialScope ||
      financialScope.organizationId !== authority.organizationId ||
      financialScope.membershipId !== authority.membershipId
    )
      throw new ManagementAccessDeniedError();
  }
  const result = await transaction.query<CashRow>(
    `SELECT s.cash_expected::text AS "cashExpected", s.cash_reported::text AS "cashReported",
      s.cash_variance::text AS "cashVariance", s.cash_currency AS currency,
      s.cash_reported_at AS "reportedAt",
      CASE WHEN reporter.status='ACTIVE' AND reporter_user.status='ACTIVE'
        THEN NULLIF(btrim(concat_ws(' ', reporter.first_name, reporter.last_name)), '')
        ELSE NULL END AS "reportedBy"
     FROM shifts s
     LEFT JOIN organization_memberships reporter
       ON reporter.organization_id=s.organization_id AND reporter.id=s.cash_reported_by_membership_id
     LEFT JOIN users reporter_user ON reporter_user.id=reporter.user_id
     WHERE s.id=$1 AND s.organization_id=$2 AND s.location_id=$3`,
    [shift.shiftId, authority.organizationId, shift.location.locationId],
  );
  const row = result.rows[0];
  if (!row) throw new ManagementAccessDeniedError();
  if (shift.status === "ACTIVE")
    return { state: "NOT_REPORTED", snapshot: null };
  if (
    row.cashExpected !== null &&
    row.cashReported !== null &&
    row.cashVariance !== null &&
    row.currency !== null &&
    row.reportedAt !== null
  ) {
    return {
      state: "REPORTED",
      snapshot: {
        cashExpected: row.cashExpected,
        cashReported: row.cashReported,
        cashVariance: row.cashVariance,
        currency: row.currency,
        reportedAt: row.reportedAt.toISOString(),
        reportedBy: row.reportedBy,
      },
    };
  }
  const empty = [
    row.cashExpected,
    row.cashReported,
    row.cashVariance,
    row.currency,
    row.reportedAt,
  ].every((value) => value === null);
  return { state: empty ? "NOT_REPORTED" : "UNAVAILABLE", snapshot: null };
}
