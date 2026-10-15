import { UnauthorizedException } from "@nestjs/common";
import type { PostgresTransaction } from "../../common/database/postgres";
import { lockLocationLifecycle } from "../../common/database/location-lifecycle-lock";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { lockAndRecheckStaffSessionContext } from "../auth/staff-session-revalidation";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";
import {
  authorizeCustodyActorForPersistedScope,
  CustodyStaffAuthorizationError,
  requireActiveCustodyUser,
} from "../staff/custody-staff-authorizer";
import { CustodyMutationError } from "./protected-custody-command";
import type { StaffValetSessionState } from "@valet/contracts";

export interface CancelCheckInAuthorityInput {
  authenticatedUserId: string;
  sessionId: string;
  expectedShiftId: string;
}
export interface CancelCheckInTarget {
  id: string;
  organization_id: string;
  location_id: string;
  checked_in_by_membership_id: string;
  state: StaffValetSessionState;
  version: number;
  intake_only: boolean;
}
export async function authorizeAndLockCancelTarget(
  transaction: PostgresTransaction,
  input: CancelCheckInAuthorityInput,
  credential?: StaffSessionContext,
) {
  const initial = await transaction.query<CancelCheckInTarget>(
    `SELECT id::text, organization_id::text, location_id::text,
            checked_in_by_membership_id::text
     FROM valet_sessions WHERE id = $1`,
    [input.sessionId],
  );
  const scope = initial.rows[0];
  if (!scope) throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  await lockLocationLifecycle(transaction, scope.location_id, "SHARED");
  await recheckCancellationCredential(transaction, input, credential);
  await requireActiveCustodyUser(transaction, input.authenticatedUserId);
  const actor = await authorizeCustodyActorForPersistedScope(transaction, {
    allowedRoles: ["VALET_EMPLOYEE", "VALET_SUPERVISOR"],
    authenticatedUserId: input.authenticatedUserId,
    resourceScope: {
      organizationId: scope.organization_id,
      locationId: scope.location_id,
    },
  });
  if (actor.membershipId !== scope.checked_in_by_membership_id)
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  const eligibility = await lockShiftOperationalEligibility(transaction, {
    locationId: scope.location_id,
    membershipId: actor.membershipId,
  });
  if (eligibility?.shiftId !== input.expectedShiftId)
    throw new CustodyStaffAuthorizationError("LOCATION_ACCESS_DENIED");
  const locked = await transaction.query<CancelCheckInTarget>(
    `SELECT id::text, organization_id::text, location_id::text,
            checked_in_by_membership_id::text, state::text, version,
            (checking_in_completed_at IS NULL AND parking_started_at IS NULL
             AND parked_at IS NULL AND retrieval_requested_at IS NULL
             AND retrieval_started_at IS NULL AND ready_at IS NULL
             AND handoff_pending_at IS NULL AND completed_at IS NULL
             AND completed_by_membership_id IS NULL
             AND current_assignee_membership_id IS NULL
             AND key_slot_id IS NULL AND parking_zone_id IS NULL
             AND parking_spot_id IS NULL) AS intake_only
     FROM valet_sessions WHERE id = $1 AND organization_id = $2
       AND location_id = $3 FOR UPDATE`,
    [input.sessionId, scope.organization_id, scope.location_id],
  );
  const session = locked.rows[0];
  if (!session || session.checked_in_by_membership_id !== actor.membershipId)
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  return { actor, session };
}

export async function recheckCancellationCredential(
  transaction: PostgresTransaction,
  input: CancelCheckInAuthorityInput,
  credential?: StaffSessionContext,
): Promise<void> {
  if (credential &&
      (credential.userId !== input.authenticatedUserId ||
       !await lockAndRecheckStaffSessionContext(transaction, credential))) {
    throw new UnauthorizedException();
  }
}

export async function assertCoherentCancellation(
  transaction: PostgresTransaction,
  session: CancelCheckInTarget,
) {
  const result = await transaction.query<{ coherent: boolean }>(
    `SELECT count(*) = 1 AND bool_and(
       $5::int > 1 AND NOT EXISTS(SELECT 1 FROM tasks WHERE valet_session_id = $1)
       AND entity_type = 'ValetSession' AND entity_id = $1
       AND actor_type = 'MEMBERSHIP' AND actor_membership_id = $4
       AND metadata_json = jsonb_build_object('fromState','CHECKING_IN',
         'toState','CANCELLED','fromVersion',$5::int - 1,'toVersion',$5::int)
     ) AS coherent FROM audit_events
     WHERE valet_session_id = $1 AND organization_id = $2 AND location_id = $3
       AND event_type = 'VALET_SESSION_CHECK_IN_CANCELLED'`,
    [
      session.id,
      session.organization_id,
      session.location_id,
      session.checked_in_by_membership_id,
      session.version,
    ],
  );
  if (!session.intake_only || result.rows[0]?.coherent !== true)
    throw new CustodyMutationError("INVALID_STATE_TRANSITION");
}
