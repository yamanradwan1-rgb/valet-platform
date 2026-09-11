import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffPushIntentCreationPolicy } from "./staff-push-operational-policy";

export interface RetrievalPushAttentionScope {
  readonly locationId: string;
  readonly organizationId: string;
  readonly taskId: string;
  readonly valetSessionId: string;
}

export interface RetrievalPushAttentionResult {
  readonly deliveryCount: number;
  readonly intentId: string;
}

export async function persistRetrievalPushAttention(
  transaction: PostgresTransaction,
  scope: RetrievalPushAttentionScope,
  operationTime: Date,
  policy: StaffPushIntentCreationPolicy,
): Promise<RetrievalPushAttentionResult> {
  const intentId = randomUUID();
  const intent = await transaction.query(
    `INSERT INTO staff_push_intents
       (id, organization_id, location_id, valet_session_id, task_id, kind,
        policy_version, expires_at, created_at)
     SELECT $1, task.organization_id, task.location_id, task.valet_session_id,
            task.id, 'EMPLOYEE_RETRIEVAL_REQUESTED', $6,
            $5::timestamptz + make_interval(secs => $7), $5
     FROM tasks AS task
     WHERE task.id = $2 AND task.organization_id = $3
       AND task.location_id = $4 AND task.valet_session_id = $8
       AND task.task_type = 'RETRIEVAL' AND task.status = 'QUEUED'
       AND task.current_assignee_membership_id IS NULL`,
    [
      intentId,
      scope.taskId,
      scope.organizationId,
      scope.locationId,
      operationTime,
      policy.policyVersion,
      policy.intentTtlSeconds,
      scope.valetSessionId,
    ],
  );
  if (intent.rowCount !== 1) {
    throw new Error("Retrieval Push intent task invariant was not satisfied.");
  }

  const deliveries = await transaction.query(
    `INSERT INTO staff_push_deliveries
       (id, organization_id, intent_id, registration_id,
        recipient_membership_id, state, attempt_count, max_attempts,
        next_attempt_at, lease_token, lease_expires_at,
        provider_result_class, provider_reference, provider_accepted_at,
        terminal_at, created_at, updated_at)
     SELECT gen_random_uuid(), task.organization_id, $1, registration.id,
            membership.id, 'PENDING', 0, $6, $5,
            NULL, NULL, NULL, NULL, NULL, NULL, $5, $5
     FROM tasks AS task
     INNER JOIN organizations AS organization
       ON organization.id = task.organization_id
      AND organization.status = 'ACTIVE'
     INNER JOIN locations AS location
       ON location.id = task.location_id
      AND location.organization_id = task.organization_id
      AND location.status = 'ACTIVE'
     INNER JOIN organization_memberships AS membership
       ON membership.organization_id = task.organization_id
      AND membership.status = 'ACTIVE'
      AND membership.role IN ('VALET_EMPLOYEE', 'VALET_SUPERVISOR')
     INNER JOIN users AS staff_user
       ON staff_user.id = membership.user_id
      AND staff_user.status = 'ACTIVE'
     INNER JOIN staff_auth_sessions AS staff_session
       ON staff_session.user_id = staff_user.id
      AND staff_session.revoked_at IS NULL
      AND staff_session.absolute_expires_at > clock_timestamp()
     INNER JOIN staff_push_registrations AS registration
       ON registration.staff_auth_session_id = staff_session.id
      AND registration.state = 'ACTIVE'
     WHERE task.id = $2 AND task.organization_id = $3
       AND task.location_id = $4 AND task.valet_session_id = $7
       AND task.task_type = 'RETRIEVAL' AND task.status = 'QUEUED'
       AND task.current_assignee_membership_id IS NULL
       AND EXISTS (
         SELECT 1 FROM membership_location_access AS location_access
         WHERE location_access.organization_id = task.organization_id
           AND location_access.membership_id = membership.id
           AND location_access.location_id = task.location_id
       )
       AND EXISTS (
         SELECT 1 FROM shifts AS shift
         WHERE shift.organization_id = task.organization_id
           AND shift.location_id = task.location_id
           AND shift.membership_id = membership.id
           AND shift.status = 'ACTIVE'
       )`,
    [
      intentId,
      scope.taskId,
      scope.organizationId,
      scope.locationId,
      operationTime,
      policy.maxAttempts,
      scope.valetSessionId,
    ],
  );
  return { deliveryCount: deliveries.rowCount ?? 0, intentId };
}
