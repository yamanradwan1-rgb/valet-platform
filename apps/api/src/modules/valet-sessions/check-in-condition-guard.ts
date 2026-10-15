import type { PostgresTransaction } from "../../common/database/postgres";
import { CustodyStaffAuthorizationError } from "../staff/custody-staff-authorizer";
import {
  receiptMatchesCurrentVerifiedEvidence,
  type TrustedConditionPhotoReceipt,
} from "./condition-photo-qualified-receipt";

export type CheckInPhotoPolicySource =
  "LOCATION_OVERRIDE" | "ORGANIZATION_DEFAULT";

export interface EffectiveCheckInPhotoPolicy {
  readonly required: boolean;
  readonly source: CheckInPhotoPolicySource;
}

export interface LockedCheckInConditionGuardScope {
  readonly locationId: string;
  readonly organizationId: string;
  readonly valetSessionId: string;
}

export interface CheckInConditionGuardResult {
  readonly completedAt: Date | null;
  readonly completedByMembershipId: string | null;
  readonly markerComplete: boolean;
  readonly photoPolicy: EffectiveCheckInPhotoPolicy;
  readonly qualifyingPhotoPresent: boolean;
  readonly satisfied: boolean;
}

export interface TrustedCheckInPhotoContext {
  readonly receipt: TrustedConditionPhotoReceipt | undefined;
  readonly requestNonce: string;
}

interface GuardRow {
  check_in_condition_completed_at: Date | null;
  check_in_condition_completed_by_membership_id: string | null;
  check_in_photos_required: boolean;
  check_in_photos_required_override: boolean | null;
}

export function evaluateEffectiveCheckInPhotoPolicy(input: {
  readonly locationOverride: boolean | null;
  readonly organizationDefault: boolean;
}): EffectiveCheckInPhotoPolicy {
  if (input.locationOverride !== null) {
    return { required: input.locationOverride, source: "LOCATION_OVERRIDE" };
  }
  return { required: input.organizationDefault, source: "ORGANIZATION_DEFAULT" };
}

/** Called only after the existing session lock and actor authorization. */
export async function evaluateLockedCheckInConditionGuard(
  transaction: PostgresTransaction,
  scope: LockedCheckInConditionGuardScope,
  trusted?: TrustedCheckInPhotoContext,
): Promise<CheckInConditionGuardResult> {
  const result = await transaction.query<GuardRow>(
    `SELECT session.check_in_condition_completed_at,
            session.check_in_condition_completed_by_membership_id::text,
            organization.check_in_photos_required,
            location.check_in_photos_required_override
     FROM valet_sessions AS session
     INNER JOIN organizations AS organization
       ON organization.id = session.organization_id
     INNER JOIN locations AS location
       ON location.organization_id = session.organization_id
      AND location.id = session.location_id
     WHERE session.id = $1
       AND session.organization_id = $2
       AND session.location_id = $3
     FOR SHARE OF organization, location`,
    [scope.valetSessionId, scope.organizationId, scope.locationId],
  );
  const row = result.rows[0];
  if (!row) throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");

  const photoPolicy = evaluateEffectiveCheckInPhotoPolicy({
    locationOverride: row.check_in_photos_required_override,
    organizationDefault: row.check_in_photos_required,
  });
  const markerComplete = row.check_in_condition_completed_at !== null &&
    row.check_in_condition_completed_by_membership_id !== null;
  const qualifyingPhotoPresent = photoPolicy.required && trusted !== undefined
    ? await receiptMatchesCurrentVerifiedEvidence(
        transaction, scope, trusted.receipt, trusted.requestNonce,
      )
    : false;

  return {
    completedAt: row.check_in_condition_completed_at,
    completedByMembershipId: row.check_in_condition_completed_by_membership_id,
    markerComplete,
    photoPolicy,
    qualifyingPhotoPresent,
    satisfied: markerComplete && (!photoPolicy.required || qualifyingPhotoPresent),
  };
}
