import { webPushSubscriptionRequestSchema } from "@valet/contracts";

import {
  decryptWebPushCredentials,
  WebPushDecryptionError,
  type WebPushStorageKeyring,
} from "../../common/web-push/subscription-crypto";
import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type {
  ClaimedWebPushDelivery,
  PreparedWebPushDelivery,
  SubscriptionSnapshot,
} from "./web-push-delivery-types";

interface DeliveryRow {
  attempt_count: number;
  audience: "EMPLOYEE" | "GUEST";
  auth_ciphertext: string | null;
  endpoint_ciphertext: string | null;
  endpoint_fingerprint: string;
  encryption_key_version: string | null;
  expires_at: Date;
  intent_id: string;
  locale: "en" | "ar";
  p256dh_ciphertext: string | null;
  presentation_type: "EMPLOYEE_RETRIEVAL_REQUESTED" | "GUEST_VEHICLE_READY";
  guest_ready_at: Date | null;
  push_subscription_id: string;
  task_id: string | null;
  valet_session_id: string | null;
}

function credentialSnapshot(row: DeliveryRow): SubscriptionSnapshot | null {
  if (
    row.auth_ciphertext === null ||
    row.endpoint_ciphertext === null ||
    row.encryption_key_version === null ||
    row.p256dh_ciphertext === null
  )
    return null;
  return {
    authCiphertext: row.auth_ciphertext,
    endpointCiphertext: row.endpoint_ciphertext,
    endpointFingerprint: row.endpoint_fingerprint,
    encryptionKeyVersion: row.encryption_key_version,
    p256dhCiphertext: row.p256dh_ciphertext,
  };
}

async function suppress(
  transaction: PostgresTransaction,
  claim: ClaimedWebPushDelivery,
  failure: "AUTHORITY" | "DECRYPTION",
): Promise<void> {
  await transaction.query(
    `UPDATE web_push_deliveries SET status = 'SUPPRESSED',
       suppressed_at = clock_timestamp(), last_failure_class = $3,
       lease_token = NULL, lease_expires_at = NULL, updated_at = clock_timestamp()
     WHERE id = $1 AND lease_token = $2 AND status = 'PENDING'`,
    [claim.deliveryId, claim.leaseToken, failure],
  );
}

export async function tombstoneWebPushDecryptionFailure(
  transaction: PostgresTransaction,
  subscriptionId: string,
  snapshot: SubscriptionSnapshot,
): Promise<boolean> {
  const result = await transaction.query(
    `UPDATE web_push_subscriptions
     SET disabled_at = clock_timestamp(), disabled_reason = 'DECRYPTION_FAILED',
         endpoint_ciphertext = NULL, p256dh_ciphertext = NULL,
         auth_ciphertext = NULL, encryption_key_version = NULL,
         updated_at = clock_timestamp()
     WHERE id = $1 AND disabled_at IS NULL AND endpoint_fingerprint = $2
       AND endpoint_ciphertext = $3 AND p256dh_ciphertext = $4
       AND auth_ciphertext = $5 AND encryption_key_version = $6`,
    [
      subscriptionId,
      snapshot.endpointFingerprint,
      snapshot.endpointCiphertext,
      snapshot.p256dhCiphertext,
      snapshot.authCiphertext,
      snapshot.encryptionKeyVersion,
    ],
  );
  return result.rowCount === 1;
}

export async function prepareWebPushDelivery(
  pool: PostgresPool,
  keyring: WebPushStorageKeyring,
  claim: ClaimedWebPushDelivery,
): Promise<PreparedWebPushDelivery | null> {
  return inPostgresTransaction(pool, async (transaction) => {
    const result = await transaction.query<DeliveryRow>(deliveryAuthoritySql, [
      claim.deliveryId,
      claim.leaseToken,
    ]);
    const row = result.rows[0];
    const snapshot = row === undefined ? null : credentialSnapshot(row);
    if (row === undefined || snapshot === null) {
      await suppress(transaction, claim, "AUTHORITY");
      return null;
    }
    let credentials: { auth: string; endpoint: string; p256dh: string };
    try {
      credentials = decryptWebPushCredentials(
        {
          ...snapshot,
          subscriptionId: row.push_subscription_id,
        },
        keyring,
      );
    } catch (error) {
      if (error instanceof WebPushDecryptionError) {
        await tombstoneWebPushDecryptionFailure(
          transaction,
          row.push_subscription_id,
          snapshot,
        );
        await suppress(transaction, claim, "DECRYPTION");
        return null;
      }
      throw error;
    }
    if (
      !webPushSubscriptionRequestSchema.safeParse({
        ...credentials,
        browserExpiresAt: null,
        locale: row.locale,
      }).success
    ) {
      await tombstoneWebPushDecryptionFailure(
        transaction,
        row.push_subscription_id,
        snapshot,
      );
      await suppress(transaction, claim, "DECRYPTION");
      return null;
    }
    return {
      audience: row.audience,
      attemptCount: row.attempt_count,
      deliveryId: claim.deliveryId,
      expiresAt: row.expires_at,
      intentId: row.intent_id,
      locale: row.locale,
      presentationType: row.presentation_type,
      readyAt: row.guest_ready_at,
      subscriptionId: row.push_subscription_id,
      subscriptionSnapshot: snapshot,
      taskId: row.task_id,
      valetSessionId: row.valet_session_id,
      ...credentials,
    };
  });
}

const deliveryAuthoritySql = `SELECT delivery.attempt_count, intent.id::text AS intent_id,
  intent.presentation_type::text, intent.task_id::text, intent.valet_session_id::text,
  intent.guest_ready_at, intent.expires_at, subscription.id::text AS push_subscription_id,
  subscription.audience::text, subscription.locale, subscription.endpoint_fingerprint,
  subscription.endpoint_ciphertext, subscription.p256dh_ciphertext,
  subscription.auth_ciphertext, subscription.encryption_key_version
 FROM web_push_deliveries AS delivery
 INNER JOIN web_push_delivery_intents AS intent ON intent.id = delivery.intent_id
 INNER JOIN web_push_subscriptions AS subscription ON subscription.id = delivery.push_subscription_id
 LEFT JOIN tasks AS task ON task.id = intent.task_id
 LEFT JOIN valet_sessions AS guest_session ON guest_session.id = intent.valet_session_id
 WHERE delivery.id = $1 AND delivery.lease_token = $2 AND delivery.status = 'PENDING'
   AND intent.expires_at > clock_timestamp() AND subscription.disabled_at IS NULL
   AND (subscription.browser_expires_at IS NULL OR subscription.browser_expires_at > clock_timestamp())
   AND ((intent.presentation_type = 'EMPLOYEE_RETRIEVAL_REQUESTED'
     AND task.task_type = 'RETRIEVAL' AND task.status = 'QUEUED'
     AND task.current_assignee_membership_id IS NULL
     AND EXISTS (SELECT 1 FROM staff_auth_sessions AS auth_session
       INNER JOIN users AS user_row ON user_row.id = auth_session.user_id AND user_row.status = 'ACTIVE'
       INNER JOIN organization_memberships AS membership ON membership.user_id = user_row.id
         AND membership.organization_id = task.organization_id AND membership.status = 'ACTIVE'
         AND membership.role IN ('VALET_EMPLOYEE','VALET_SUPERVISOR')
       INNER JOIN organizations AS organization ON organization.id = membership.organization_id AND organization.status = 'ACTIVE'
       INNER JOIN locations AS location ON location.id = task.location_id AND location.organization_id = organization.id AND location.status = 'ACTIVE'
       INNER JOIN membership_location_access AS access_row ON access_row.membership_id = membership.id AND access_row.location_id = location.id AND access_row.organization_id = organization.id
       INNER JOIN shifts AS shift_row ON shift_row.membership_id = membership.id AND shift_row.location_id = location.id AND shift_row.organization_id = organization.id AND shift_row.status = 'ACTIVE'
       WHERE auth_session.id = subscription.staff_auth_session_id
         AND auth_session.revoked_at IS NULL AND auth_session.absolute_expires_at > clock_timestamp()))
   OR (intent.presentation_type = 'GUEST_VEHICLE_READY'
     AND guest_session.ready_at = intent.guest_ready_at AND guest_session.state <> 'COMPLETED'
     AND guest_session.customer_access_generation = subscription.guest_access_generation
     AND guest_session.customer_access_revoked_at IS NULL
     AND guest_session.customer_access_expires_at > clock_timestamp()
     AND subscription.guest_valet_session_id = guest_session.id))`;
