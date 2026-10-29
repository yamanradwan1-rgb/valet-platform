import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type {
  ClaimedStaffPushDelivery,
  EligibleStaffPushDelivery,
} from "./staff-push-delivery-types";

interface ClaimStateRow {
  readonly expired: boolean;
}

interface ClaimScopeRow {
  readonly organization_id: string;
}

interface EligibleRow {
  readonly intent_id: string;
  readonly locale: "en" | "ar";
  readonly provider_token: string;
  readonly registration_id: string;
  readonly remaining_lifetime_milliseconds: number;
  readonly token_hash: string;
}

interface LeaseBudgetRow {
  readonly remaining_lease_milliseconds: number;
}

export async function currentStaffPushLeaseBudgetMilliseconds(
  pool: PostgresPool,
  claim: ClaimedStaffPushDelivery,
): Promise<number | undefined> {
  const result = await pool.query<LeaseBudgetRow>(
    `WITH clock AS MATERIALIZED (SELECT clock_timestamp() AS now)
     SELECT floor(EXTRACT(EPOCH FROM (delivery.lease_expires_at - clock.now))
                  * 1000)::integer AS remaining_lease_milliseconds
     FROM staff_push_deliveries AS delivery
     CROSS JOIN clock
     WHERE delivery.id = $1 AND delivery.state = 'LEASED'
       AND delivery.lease_token = $2`,
    [claim.deliveryId, claim.leaseToken],
  );
  return result.rows[0]?.remaining_lease_milliseconds;
}

export async function claimedDeliveryIsExpired(
  pool: PostgresPool,
  claim: ClaimedStaffPushDelivery,
): Promise<boolean | undefined> {
  const result = await pool.query<ClaimStateRow>(
    `SELECT intent.expires_at <= clock_timestamp() AS expired
     FROM staff_push_deliveries AS delivery
     INNER JOIN staff_push_intents AS intent ON intent.id = delivery.intent_id
     WHERE delivery.id = $1 AND delivery.state = 'LEASED'
       AND delivery.lease_token = $2`,
    [claim.deliveryId, claim.leaseToken],
  );
  return result.rows[0]?.expired;
}

export async function resolveEligibleStaffPushDelivery(
  pool: PostgresPool,
  claim: ClaimedStaffPushDelivery,
  activeRegistrationStaleDays: number,
): Promise<EligibleStaffPushDelivery | undefined> {
  return inPostgresTransaction(pool, async (transaction) => {
    const scope = await transaction.query<ClaimScopeRow>(
      `SELECT delivery.organization_id,
              pg_advisory_xact_lock_shared(
                hashtextextended(
                  'management-settings-org:' || delivery.organization_id::text, 0
                )
              )
       FROM staff_push_deliveries AS delivery
       WHERE delivery.id = $1 AND delivery.state = 'LEASED'
         AND delivery.lease_token = $2`,
      [claim.deliveryId, claim.leaseToken],
    );
    if (scope.rows[0] === undefined) return undefined;

    // The lock acquisition above may wait for an exclusive settings writer.
    // Keep the eligibility read as a second READ COMMITTED statement so it sees
    // that writer's committed policy before this transaction releases the lock.
    const result = await transaction.query<EligibleRow>(
      `WITH clock AS MATERIALIZED (SELECT clock_timestamp() AS now)
     SELECT intent.id AS intent_id,
            registration.id AS registration_id, registration.provider_token,
            registration.token_hash, registration.locale::text,
            floor(EXTRACT(EPOCH FROM (intent.expires_at - clock.now)) * 1000)::integer
              AS remaining_lifetime_milliseconds
     FROM staff_push_deliveries AS delivery
     CROSS JOIN clock
     INNER JOIN staff_push_intents AS intent
       ON intent.id = delivery.intent_id
      AND intent.organization_id = delivery.organization_id
      AND intent.kind = 'EMPLOYEE_RETRIEVAL_REQUESTED'
      AND intent.policy_version = 1
      AND intent.expires_at > clock.now
     INNER JOIN staff_push_registrations AS registration
       ON registration.id = delivery.registration_id
      AND registration.state = 'ACTIVE'
      AND registration.provider = 'FCM'
      AND registration.platform = 'ANDROID'
      AND registration.app_identifier = 'com.vaylet.employee'
      AND registration.provider_token IS NOT NULL
      AND registration.last_confirmed_at >
        clock.now - make_interval(days => $3)
     INNER JOIN staff_auth_sessions AS staff_session
       ON staff_session.id = registration.staff_auth_session_id
      AND staff_session.revoked_at IS NULL
      AND staff_session.absolute_expires_at > clock.now
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
      AND COALESCE(location.employee_retrieval_requested_notification_enabled_override,
                   organization.employee_retrieval_requested_notification_enabled)
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
      [claim.deliveryId, claim.leaseToken, activeRegistrationStaleDays],
    );
    const row = result.rows[0];
    if (row === undefined) return undefined;
    return {
      ...claim,
      intentId: row.intent_id,
      locale: row.locale,
      providerToken: row.provider_token,
      registrationId: row.registration_id,
      remainingLifetimeMilliseconds: row.remaining_lifetime_milliseconds,
      tokenHash: row.token_hash,
    };
  });
}
