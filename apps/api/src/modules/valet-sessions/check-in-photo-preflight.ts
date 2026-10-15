import { randomUUID } from "node:crypto";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import {
  authorizeCustodyActorForPersistedScope,
  CustodyStaffAuthorizationError,
  requireActiveCustodyUser,
} from "../staff/custody-staff-authorizer";
import type { PrivatePhotoStore } from "../vehicle-photos/private-photo-store";
import {
  evaluateEffectiveCheckInPhotoPolicy,
  type TrustedCheckInPhotoContext,
} from "./check-in-condition-guard";
import {
  proveSelectedConditionPhotoBytes,
  selectVerifiedConditionPhotoCandidates,
} from "./condition-photo-qualified-receipt";

export interface CheckInPhotoPreflightRequest {
  readonly authenticatedUserId: string;
  readonly valetSessionId: string;
}

interface AuthorizedReadRow {
  readonly organization_id: string;
  readonly location_id: string;
  readonly state: string;
  readonly check_in_condition_completed_at: Date | null;
  readonly check_in_condition_completed_by_membership_id: string | null;
  readonly check_in_photos_required: boolean;
  readonly check_in_photos_required_override: boolean | null;
}

/**
 * Read scope/authorization in a short transaction; perform all private object
 * reads only after its COMMIT and release. Stage C independently locks again.
 */
export function createCheckInPhotoPreflight(
  pool: PostgresPool,
  store: PrivatePhotoStore,
  approvedBucketAlias: string,
  skipHistoricalMarker = false,
): (request: CheckInPhotoPreflightRequest) => Promise<TrustedCheckInPhotoContext> {
  return async (request) => {
    const requestNonce = `${randomUUID()}-${randomUUID()}`;
    const candidates = await inPostgresTransaction(pool, async (tx) => {
      await requireActiveCustodyUser(tx, request.authenticatedUserId);
      const result = await tx.query<AuthorizedReadRow>(
        `SELECT s.organization_id::text, s.location_id::text,
                s.state::text,
                s.check_in_condition_completed_at,
                s.check_in_condition_completed_by_membership_id::text,
                o.check_in_photos_required,
                l.check_in_photos_required_override
         FROM valet_sessions AS s
         JOIN organizations AS o ON o.id = s.organization_id
         JOIN locations AS l ON l.id = s.location_id
           AND l.organization_id = s.organization_id
         WHERE s.id = $1`,
        [request.valetSessionId],
      );
      const row = result.rows[0];
      if (!row) throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
      await authorizeCustodyActorForPersistedScope(tx, {
        allowedRoles: ["VALET_EMPLOYEE", "VALET_SUPERVISOR"],
        authenticatedUserId: request.authenticatedUserId,
        resourceScope: {
          organizationId: row.organization_id,
          locationId: row.location_id,
        },
      });
      const markerExists = row.check_in_condition_completed_at !== null &&
        row.check_in_condition_completed_by_membership_id !== null;
      const policy = evaluateEffectiveCheckInPhotoPolicy({
        organizationDefault: row.check_in_photos_required,
        locationOverride: row.check_in_photos_required_override,
      });
      if (row.state !== "CHECKING_IN" || !policy.required ||
          (skipHistoricalMarker && markerExists)) return [];
      return selectVerifiedConditionPhotoCandidates(tx, {
        organizationId: row.organization_id,
        locationId: row.location_id,
        valetSessionId: request.valetSessionId,
      });
    });

    // Bound aggregate provider time even with ten corrupt/missing candidates.
    const deadline = Date.now() + 15_000;
    for (const candidate of candidates) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const receipt = await proveSelectedConditionPhotoBytes(
        store, candidate, approvedBucketAlias, requestNonce, remaining,
      );
      if (receipt) return { receipt, requestNonce };
    }
    return { receipt: undefined, requestNonce };
  };
}
