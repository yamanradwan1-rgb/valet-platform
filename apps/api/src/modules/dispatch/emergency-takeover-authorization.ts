import { UnauthorizedException } from "@nestjs/common";

import type { PostgresTransaction } from "../../common/database/postgres";
import { lockLocationLifecycle } from "../../common/database/location-lifecycle-lock";
import { requireMfaAssuranceInTransaction } from "../auth/mfa/mfa-assurance-policy";
import { MfaStepUpRequiredError } from "../auth/mfa/mfa-errors";
import { localMfaBypassEnabled } from "../auth/mfa/local-mfa-bypass";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { lockAndRecheckStaffSessionContext } from "../auth/staff-session-revalidation";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";
import { DispatchOperationError } from "./dispatch-errors";
import type {
  EmergencyTakeoverActor,
  LockedEmergencySession,
} from "./emergency-takeover-types";

/** Hold the current credential and user-security boundary through COMMIT. */
export async function requireCurrentEmergencyCredential(
  tx: PostgresTransaction,
  context: StaffSessionContext,
): Promise<void> {
  if ((await lockAndRecheckStaffSessionContext(tx, context)) === undefined) {
    throw new UnauthorizedException();
  }
}

/** Rechecks location, organization, user, membership, role and Shift as locked facts. */
export async function requireEmergencyTakeoverActor(
  tx: PostgresTransaction,
  session: LockedEmergencySession,
  context: StaffSessionContext,
): Promise<EmergencyTakeoverActor> {
  await lockLocationLifecycle(tx, session.location_id, "SHARED");
  const result = await tx.query<{ membership_id: string; role: string }>(
    `SELECT membership.id::text AS membership_id, membership.role::text AS role
     FROM organization_memberships AS membership
     JOIN users AS staff_user ON staff_user.id=membership.user_id
     JOIN organizations AS organization ON organization.id=membership.organization_id
     JOIN locations AS location ON location.organization_id=organization.id
       AND location.id=$2
     WHERE membership.user_id=$1 AND membership.organization_id=$3
       AND membership.status='ACTIVE' AND staff_user.status='ACTIVE'
       AND organization.status='ACTIVE' AND location.status='ACTIVE'
       AND membership.role IN ('ORG_ADMIN','VALET_SUPERVISOR')
     FOR SHARE OF membership,organization,location`,
    [context.userId, session.location_id, session.organization_id],
  );
  const actor = result.rows[0];
  if (result.rowCount !== 1 || actor === undefined) {
    throw new DispatchOperationError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  if (actor.role === "VALET_SUPERVISOR") {
    const shift = await lockShiftOperationalEligibility(tx, {
      locationId: session.location_id,
      membershipId: actor.membership_id,
    });
    if (shift === null) {
      throw new DispatchOperationError("TASK_NOT_FOUND_OR_FORBIDDEN");
    }
    return { membershipId: actor.membership_id, role: "VALET_SUPERVISOR" };
  }
  // ORG_ADMIN may initiate a takeover but gains no operational Shift or release authority.
  await requireMfaAssuranceInTransaction(tx, context, { sensitive: true });
  if (!localMfaBypassEnabled()) {
    // Keep the proven ACTIVE factor valid through the takeover commit as well.
    // Factor retirement uses an UPDATE lock on this same row.
    const factor = await tx.query(
      `SELECT factor.id FROM user_mfa_totp_factors AS factor
       JOIN staff_auth_sessions AS session ON session.mfa_factor_id=factor.id
       WHERE session.id=$1 AND factor.user_id=$2 AND factor.state='ACTIVE'
       FOR SHARE OF factor`,
      [context.staffAuthSessionId, context.userId],
    );
    if (factor.rowCount !== 1) throw new MfaStepUpRequiredError();
  }
  return { membershipId: actor.membership_id, role: "ORG_ADMIN" };
}

export async function requireEmergencyReplacement(
  tx: PostgresTransaction,
  session: LockedEmergencySession,
  membershipId: string,
): Promise<void> {
  const membership = await tx.query<{ id: string }>(
    `SELECT id::text FROM organization_memberships
     WHERE organization_id=$1 AND id=$2
       AND status='ACTIVE' AND role IN ('VALET_EMPLOYEE','VALET_SUPERVISOR')
     FOR SHARE`,
    [session.organization_id, membershipId],
  );
  if (membership.rowCount !== 1) {
    throw new DispatchOperationError("TASK_ASSIGNEE_NOT_ELIGIBLE");
  }
  if (
    (await lockShiftOperationalEligibility(tx, {
      locationId: session.location_id,
      membershipId,
    })) === null
  ) {
    throw new DispatchOperationError("TASK_ASSIGNEE_NOT_ELIGIBLE");
  }
}
