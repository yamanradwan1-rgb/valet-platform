import type { PostgresPool } from "../../common/database/postgres";
import type {
  ClaimedStaffPushDelivery,
  EligibleStaffPushDelivery,
} from "./staff-push-delivery-types";

interface ClaimStateRow {
  readonly expires_at: Date;
}

interface EligibleRow {
  readonly expires_at: Date;
  readonly intent_id: string;
  readonly locale: "en" | "ar";
  readonly provider_token: string;
  readonly registration_id: string;
  readonly token_hash: string;
}

export async function claimedDeliveryExpiry(
  pool: PostgresPool,
  claim: ClaimedStaffPushDelivery,
): Promise<Date | undefined> {
  const result = await pool.query<ClaimStateRow>(
    `SELECT intent.expires_at
     FROM staff_push_deliveries AS delivery
     INNER JOIN staff_push_intents AS intent ON intent.id = delivery.intent_id
     WHERE delivery.id = $1 AND delivery.state = 'LEASED'
       AND delivery.lease_token = $2`,
    [claim.deliveryId, claim.leaseToken],
  );
  return result.rows[0]?.expires_at;
}

export async function resolveEligibleStaffPushDelivery(
  pool: PostgresPool,
  claim: ClaimedStaffPushDelivery,
): Promise<EligibleStaffPushDelivery | undefined> {
  const result = await pool.query<EligibleRow>(
    `SELECT intent.id AS intent_id, intent.expires_at,
            registration.id AS registration_id, registration.provider_token,
            registration.token_hash, registration.locale::text
     FROM staff_push_deliveries AS delivery
     INNER JOIN staff_push_intents AS intent
       ON intent.id = delivery.intent_id
      AND intent.organization_id = delivery.organization_id
      AND intent.kind = 'EMPLOYEE_RETRIEVAL_REQUESTED'
      AND intent.policy_version = 1
      AND intent.expires_at > clock_timestamp()
     INNER JOIN staff_push_registrations AS registration
       ON registration.id = delivery.registration_id
      AND registration.state = 'ACTIVE'
      AND registration.provider = 'FCM'
      AND registration.platform = 'ANDROID'
      AND registration.app_identifier = 'com.vaylet.employee'
      AND registration.provider_token IS NOT NULL
     INNER JOIN staff_auth_sessions AS staff_session
       ON staff_session.id = registration.staff_auth_session_id
      AND staff_session.revoked_at IS NULL
      AND staff_session.absolute_expires_at > clock_timestamp()
     INNER JOIN users AS staff_user
       ON staff_user.id = staff_session.user_id
      AND staff_user.status = 'ACTIVE'
     INNER JOIN organization_memberships AS membership
       ON membership.id = delivery.recipient_membership_id
      AND membership.organization_id = delivery.organization_id
      AND membership.user_id = staff_user.id
      AND membership.status = 'ACTIVE'
      AND membership.role IN ('VALET_EMPLOYEE', 'VALET_SUPERVISOR')
     INNER JOIN organizations AS organization
       ON organization.id = intent.organization_id
      AND organization.status = 'ACTIVE'
     INNER JOIN locations AS location
       ON location.id = intent.location_id
      AND location.organization_id = intent.organization_id
      AND location.status = 'ACTIVE'
     INNER JOIN valet_sessions AS valet_session
       ON valet_session.id = intent.valet_session_id
      AND valet_session.organization_id = intent.organization_id
      AND valet_session.location_id = intent.location_id
     INNER JOIN tasks AS task
       ON task.id = intent.task_id
      AND task.organization_id = intent.organization_id
      AND task.location_id = intent.location_id
      AND task.valet_session_id = intent.valet_session_id
      AND task.task_type = 'RETRIEVAL'
      AND task.status = 'QUEUED'
      AND task.current_assignee_membership_id IS NULL
     WHERE delivery.id = $1 AND delivery.state = 'LEASED'
       AND delivery.lease_token = $2
       AND EXISTS (
         SELECT 1 FROM membership_location_access AS access
         WHERE access.organization_id = delivery.organization_id
           AND access.membership_id = delivery.recipient_membership_id
           AND access.location_id = intent.location_id
       )
       AND EXISTS (
         SELECT 1 FROM shifts AS shift
         WHERE shift.organization_id = delivery.organization_id
           AND shift.membership_id = delivery.recipient_membership_id
           AND shift.location_id = intent.location_id
           AND shift.status = 'ACTIVE'
       )`,
    [claim.deliveryId, claim.leaseToken],
  );
  const row = result.rows[0];
  if (row === undefined) return undefined;
  return {
    ...claim,
    expiresAt: row.expires_at,
    intentId: row.intent_id,
    locale: row.locale,
    providerToken: row.provider_token,
    registrationId: row.registration_id,
    tokenHash: row.token_hash,
  };
}
