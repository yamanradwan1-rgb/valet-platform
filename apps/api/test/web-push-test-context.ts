import { createECDH, createHash, randomBytes, randomUUID } from "node:crypto";

import type { WebPushSubscriptionRequest } from "@valet/contracts";

import { ShiftTestContext, type ShiftFixture } from "./shift-test-context";

export interface StaffPushFixture extends ShiftFixture {
  readonly accessToken: string;
  readonly sessionId: string;
}

export interface GuestPushFixture extends ShiftFixture {
  readonly accessGeneration: string;
  readonly rawToken: string;
  readonly sessionId: string;
}

export const webPushTestActiveKey = {
  key: Buffer.alloc(32, 21),
  version: "active-t2",
};

export function configureWebPushTestEnvironment(enabled: boolean): void {
  process.env.WEB_PUSH_ENABLED = String(enabled);
  if (!enabled) return;
  const vapid = createECDH("prime256v1");
  vapid.generateKeys();
  process.env.WEB_PUSH_VAPID_PUBLIC_KEY = vapid
    .getPublicKey()
    .toString("base64url");
  process.env.WEB_PUSH_VAPID_PRIVATE_KEY = vapid
    .getPrivateKey()
    .toString("base64url");
  process.env.WEB_PUSH_VAPID_SUBJECT = "mailto:push@vaylet.test";
  process.env.WEB_PUSH_STORAGE_KEY_ACTIVE_VERSION =
    webPushTestActiveKey.version;
  process.env.WEB_PUSH_STORAGE_KEY_ACTIVE_B64URL =
    webPushTestActiveKey.key.toString("base64url");
  process.env.WEB_PUSH_ENDPOINT_FINGERPRINT_KEY_B64URL = Buffer.alloc(
    32,
    22,
  ).toString("base64url");
}

export class WebPushTestContext extends ShiftTestContext {
  constructor() {
    super("web_push_subscription_lifecycle");
  }

  async createStaff(): Promise<StaffPushFixture> {
    const fixture = await this.createFixture();
    const accessToken = `vsa1.${randomBytes(32).toString("base64url")}`;
    const sessionId = randomUUID();
    const hash = `staff-access-sha256:v1:${createHash("sha256")
      .update(accessToken, "utf8")
      .digest("hex")}`;
    await this.adminPool.query(
      `INSERT INTO staff_auth_sessions
         (id, user_id, current_access_token_hash, access_expires_at,
          absolute_expires_at, last_rotated_at)
       VALUES ($1, $2, $3, now() + interval '15 minutes',
               now() + interval '1 day', now())`,
      [sessionId, fixture.userId, hash],
    );
    return { ...fixture, accessToken, sessionId };
  }

  async createGuest(): Promise<GuestPushFixture> {
    const fixture = await this.createFixture();
    const rawToken = randomBytes(32).toString("base64url");
    const accessGeneration = randomUUID();
    const sessionId = randomUUID();
    const vehicleId = randomUUID();
    const tokenHash = `sha256:v1:${createHash("sha256")
      .update(rawToken, "utf8")
      .digest("hex")}`;
    await this.adminPool.query(
      `INSERT INTO vehicles
         (id, organization_id, temporary_descriptor, updated_at)
       VALUES ($1, $2, $3, now())`,
      [vehicleId, fixture.organizationId, `Push vehicle ${vehicleId}`],
    );
    await this.adminPool.query(
      `INSERT INTO valet_sessions
         (id, organization_id, location_id, vehicle_id,
          customer_access_token_hash, customer_access_expires_at,
          customer_access_generation, state, checked_in_by_membership_id,
          version, updated_at)
       VALUES ($1, $2, $3, $4, $5, now() + interval '1 day', $6,
               'PARKED', $7, 1, now())`,
      [
        sessionId,
        fixture.organizationId,
        fixture.locationId,
        vehicleId,
        tokenHash,
        accessGeneration,
        fixture.membershipId,
      ],
    );
    return {
      ...fixture,
      accessGeneration,
      rawToken,
      sessionId,
    };
  }

  async subscription(id: string) {
    const result = await this.adminPool.query<{
      auth_ciphertext: string | null;
      disabled_at: Date | null;
      disabled_reason: string | null;
      encryption_key_version: string | null;
      endpoint_ciphertext: string | null;
      endpoint_fingerprint: string;
      guest_access_generation: string | null;
      guest_valet_session_id: string | null;
      p256dh_ciphertext: string | null;
      staff_auth_session_id: string | null;
    }>(
      `SELECT endpoint_fingerprint, endpoint_ciphertext, p256dh_ciphertext,
              auth_ciphertext, encryption_key_version,
              staff_auth_session_id::text, guest_valet_session_id::text,
              guest_access_generation::text, disabled_at,
              disabled_reason::text
       FROM web_push_subscriptions WHERE id = $1`,
      [id],
    );
    return result.rows[0]!;
  }
}

export const pushInput = (
  endpoint: string,
  locale: "ar" | "en" = "en",
): WebPushSubscriptionRequest => ({
  auth: randomBytes(16).toString("base64url"),
  browserExpiresAt: null,
  endpoint,
  locale,
  p256dh: Buffer.concat([Buffer.from([4]), randomBytes(64)]).toString(
    "base64url",
  ),
});
