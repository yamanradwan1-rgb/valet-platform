import type { PostgresPool } from "../../common/database/postgres";
import type {
  ClaimedGuestPushDelivery,
  EligibleGuestPushDelivery,
} from "./guest-push-delivery-types";

interface EligibleRow {
  readonly auth_secret: string;
  readonly endpoint: string;
  readonly intent_id: string;
  readonly locale: "en" | "ar";
  readonly p256dh: string;
  readonly registration_id: string;
  readonly remaining_lifetime_milliseconds: number;
}

export async function resolveEligibleGuestPushDelivery(
  pool: PostgresPool,
  claim: ClaimedGuestPushDelivery,
  policyVersion: number,
): Promise<EligibleGuestPushDelivery | undefined> {
  const result = await pool.query<EligibleRow>(
    `SELECT intent_id, registration_id, endpoint, p256dh, auth_secret,
            locale, remaining_lifetime_milliseconds
     FROM public.guest_push_resolve_eligible_v1($1,$2,$3)`,
    [claim.deliveryId, claim.leaseToken, policyVersion],
  );
  const row = result.rows[0];
  if (row === undefined) return undefined;
  return {
    ...claim,
    auth: row.auth_secret,
    endpoint: row.endpoint,
    intentId: row.intent_id,
    locale: row.locale,
    p256dh: row.p256dh,
    registrationId: row.registration_id,
    remainingLifetimeMilliseconds: row.remaining_lifetime_milliseconds,
  };
}
