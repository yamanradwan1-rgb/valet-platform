import {
  conditionPhotoStateDiscoverySchema,
  type ConditionPhotoStateDiscovery,
} from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { CustodyStaffAuthorizationError } from "../staff/custody-staff-authorizer";
import { evaluateEffectiveCheckInPhotoPolicy } from "../valet-sessions/check-in-condition-command";
import {
  readConditionPhotoRecovery,
  type ConditionPhotoReadScope,
} from "./condition-photo-status-query";

interface PhotoPolicyRow {
  readonly check_in_photos_required: boolean;
  readonly check_in_photos_required_override: boolean | null;
}

/** Only current authorization may call this; reads never finalize evidence. */
export async function readConditionPhotoDiscovery(
  transaction: PostgresTransaction,
  scope: ConditionPhotoReadScope,
): Promise<ConditionPhotoStateDiscovery> {
  const policy = await transaction.query<PhotoPolicyRow>(
    `SELECT organization.check_in_photos_required,
            location.check_in_photos_required_override
     FROM valet_sessions AS session
     JOIN organizations AS organization ON organization.id = session.organization_id
     JOIN locations AS location ON location.id = session.location_id
       AND location.organization_id = session.organization_id
     WHERE session.id = $1 AND session.organization_id = $2
       AND session.location_id = $3`,
    [scope.valetSessionId, scope.organizationId, scope.locationId],
  );
  const row = policy.rows[0];
  if (row === undefined)
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  const recovery = await readConditionPhotoRecovery(transaction, scope);
  return conditionPhotoStateDiscoverySchema.parse({
    valetSessionId: scope.valetSessionId,
    photoPolicy: evaluateEffectiveCheckInPhotoPolicy({
      organizationDefault: row.check_in_photos_required,
      locationOverride: row.check_in_photos_required_override,
    }),
    // P3 alone binds real availability and current object read-back to
    // the Check-In guard. Never project legacy metadata as qualification.
    qualifyingPhotoPresent: false,
    pendingOperation: recovery.pendingOperation,
    latestOperation: recovery.latestOperation,
  });
}
