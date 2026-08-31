import type { PostgresPool } from "../../common/database/postgres";
import { WEB_PUSH_DELIVERY } from "./web-push-delivery-constants";

export async function reconcileWebPushIntents(
  pool: PostgresPool,
): Promise<number> {
  const ttl = WEB_PUSH_DELIVERY.eventTtlMilliseconds;
  const result = await pool.query(
    `WITH employee AS (
       INSERT INTO web_push_delivery_intents
         (id, presentation_type, task_id, occurred_at, expires_at)
       SELECT gen_random_uuid(), 'EMPLOYEE_RETRIEVAL_REQUESTED', task.id,
              task.created_at, task.created_at + ($1::integer * interval '1 millisecond')
       FROM tasks AS task
       WHERE task.task_type = 'RETRIEVAL' AND task.status = 'QUEUED'
         AND task.current_assignee_membership_id IS NULL
         AND task.created_at + ($1::integer * interval '1 millisecond') > clock_timestamp()
       ON CONFLICT (task_id)
         WHERE presentation_type = 'EMPLOYEE_RETRIEVAL_REQUESTED' DO NOTHING
       RETURNING id
     ), guest AS (
       INSERT INTO web_push_delivery_intents
         (id, presentation_type, valet_session_id, guest_ready_at,
          occurred_at, expires_at)
       SELECT gen_random_uuid(), 'GUEST_VEHICLE_READY', session.id,
              session.ready_at, session.ready_at,
              session.ready_at + ($1::integer * interval '1 millisecond')
       FROM valet_sessions AS session
       WHERE session.ready_at IS NOT NULL
         AND session.ready_at + ($1::integer * interval '1 millisecond') > clock_timestamp()
       ON CONFLICT (valet_session_id, guest_ready_at)
         WHERE presentation_type = 'GUEST_VEHICLE_READY' DO NOTHING
       RETURNING id
     )
     SELECT (SELECT count(*) FROM employee)::integer
          + (SELECT count(*) FROM guest)::integer AS inserted`,
    [ttl],
  );
  return Number(result.rows[0]?.inserted ?? 0);
}

export async function materializeWebPushDeliveries(
  pool: PostgresPool,
): Promise<number> {
  const result = await pool.query(
    `WITH employee AS (
       INSERT INTO web_push_deliveries
         (id, intent_id, push_subscription_id, next_attempt_at, updated_at)
       SELECT gen_random_uuid(), intent.id, subscription.id,
              clock_timestamp(), clock_timestamp()
       FROM web_push_delivery_intents AS intent
       INNER JOIN tasks AS task ON task.id = intent.task_id
       INNER JOIN web_push_subscriptions AS subscription
         ON subscription.audience = 'EMPLOYEE'
        AND subscription.disabled_at IS NULL
        AND subscription.created_at <= intent.occurred_at
       INNER JOIN staff_auth_sessions AS auth_session
         ON auth_session.id = subscription.staff_auth_session_id
        AND auth_session.revoked_at IS NULL
        AND auth_session.absolute_expires_at > clock_timestamp()
       INNER JOIN users AS user_row
         ON user_row.id = auth_session.user_id AND user_row.status = 'ACTIVE'
       INNER JOIN organization_memberships AS membership
         ON membership.user_id = user_row.id
        AND membership.organization_id = task.organization_id
        AND membership.status = 'ACTIVE'
        AND membership.role IN ('VALET_EMPLOYEE', 'VALET_SUPERVISOR')
       INNER JOIN organizations AS organization
         ON organization.id = membership.organization_id AND organization.status = 'ACTIVE'
       INNER JOIN locations AS location
         ON location.id = task.location_id
        AND location.organization_id = organization.id AND location.status = 'ACTIVE'
       INNER JOIN membership_location_access AS access_row
         ON access_row.membership_id = membership.id
        AND access_row.location_id = location.id
        AND access_row.organization_id = organization.id
       INNER JOIN shifts AS shift_row
         ON shift_row.membership_id = membership.id
        AND shift_row.location_id = location.id
        AND shift_row.organization_id = organization.id
        AND shift_row.status = 'ACTIVE'
       WHERE intent.presentation_type = 'EMPLOYEE_RETRIEVAL_REQUESTED'
         AND intent.expires_at > clock_timestamp()
         AND task.task_type = 'RETRIEVAL' AND task.status = 'QUEUED'
         AND task.current_assignee_membership_id IS NULL
       ON CONFLICT (intent_id, push_subscription_id) DO NOTHING RETURNING id
     ), guest AS (
       INSERT INTO web_push_deliveries
         (id, intent_id, push_subscription_id, next_attempt_at, updated_at)
       SELECT gen_random_uuid(), intent.id, subscription.id,
              clock_timestamp(), clock_timestamp()
       FROM web_push_delivery_intents AS intent
       INNER JOIN valet_sessions AS session ON session.id = intent.valet_session_id
       INNER JOIN web_push_subscriptions AS subscription
         ON subscription.audience = 'GUEST'
        AND subscription.guest_valet_session_id = session.id
        AND subscription.guest_access_generation = session.customer_access_generation
        AND subscription.disabled_at IS NULL
        AND subscription.created_at <= intent.occurred_at
       WHERE intent.presentation_type = 'GUEST_VEHICLE_READY'
         AND intent.expires_at > clock_timestamp()
         AND session.ready_at = intent.guest_ready_at
         AND session.state <> 'COMPLETED'
         AND session.customer_access_generation IS NOT NULL
         AND session.customer_access_revoked_at IS NULL
         AND session.customer_access_expires_at > clock_timestamp()
       ON CONFLICT (intent_id, push_subscription_id) DO NOTHING RETURNING id
     )
     SELECT (SELECT count(*) FROM employee)::integer
          + (SELECT count(*) FROM guest)::integer AS inserted`,
  );
  return Number(result.rows[0]?.inserted ?? 0);
}
