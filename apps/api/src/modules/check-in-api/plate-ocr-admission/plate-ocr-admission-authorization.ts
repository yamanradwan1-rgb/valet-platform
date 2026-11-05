import { UnauthorizedException } from "@nestjs/common";

import type { PostgresTransaction } from "../../../common/database/postgres";
import { lockAndRecheckStaffSessionContext } from "../../auth/staff-session-revalidation";
import type { StaffSessionContext } from "../../auth/staff-session-context";
import { CustodyStaffAuthorizationError } from "../../staff/custody-staff-authorizer";
import { lockShiftOperationalEligibility } from "../../shifts/shift-operational-eligibility";
import { authorizeCheckInLocation } from "../check-in-location-authorization";

export interface OcrAuthorizedScope {
  readonly organizationId: string;
  readonly membershipId: string;
  readonly locationId: string;
}

/** All authority locks are held until A commits or rolls back. */
export async function authorizeOcrAdmission(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  locationId: string,
): Promise<OcrAuthorizedScope | null> {
  const session = await lockAndRecheckStaffSessionContext(transaction, context);
  if (session === undefined) throw new UnauthorizedException();

  const scope = await authorizeCheckInLocation(
    transaction,
    context.userId,
    locationId,
    true,
  );
  const activeShift = await lockShiftOperationalEligibility(transaction, {
    membershipId: scope.actor.membershipId,
    locationId: scope.locationId,
  });
  if (activeShift === null) {
    throw new CustodyStaffAuthorizationError("AUTHORIZATION_DENIED");
  }

  // Keep the established typed Location override -> Company fallback semantics.
  // The settings lock acquired above covers these rows through admission COMMIT.
  const policy = await transaction.query<{ enabled: boolean }>(
    `SELECT COALESCE(location.ocr_assist_enabled_override,
                     organization.ocr_assist_enabled) AS enabled
     FROM locations AS location
     INNER JOIN organizations AS organization
       ON organization.id = location.organization_id
     WHERE location.id = $1 AND location.organization_id = $2`,
    [scope.locationId, scope.organizationId],
  );
  if (policy.rows[0]?.enabled !== true) return null;

  return {
    organizationId: scope.organizationId,
    membershipId: scope.actor.membershipId,
    locationId: scope.locationId,
  };
}
