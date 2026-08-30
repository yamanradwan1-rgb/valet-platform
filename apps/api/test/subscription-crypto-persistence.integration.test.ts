import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  decryptWebPushCredentials,
  encryptWebPushCredentials,
  fingerprintWebPushEndpoint,
  WebPushDecryptionError,
} from "../src/common/web-push/subscription-crypto";
import { PaymentTestContext } from "./payment-test-context";

const context = new PaymentTestContext("web_push_crypto_persistence");
const active = { key: Buffer.alloc(32, 11), version: "active-1" };

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("Web Push credential persistence representation", () => {
  it("round trips authenticated row-bound envelopes through the production table", async () => {
    const fixture = await context.createPaymentFixture();
    const staffSessionId = randomUUID();
    const subscriptionId = randomUUID();
    await context.adminPool.query(
      `INSERT INTO staff_auth_sessions
         (id, user_id, current_access_token_hash, access_expires_at,
          absolute_expires_at, last_rotated_at)
       VALUES ($1, $2, $3, now() + interval '5 minutes',
               now() + interval '1 day', now())`,
      [
        staffSessionId,
        fixture.userId,
        `staff-access-sha256:v1:${"a".repeat(64)}`,
      ],
    );
    const plaintext = {
      auth: "auth-secret",
      endpoint: "https://push.example/real-persistence",
      p256dh: "p256dh-secret",
      subscriptionId,
    };
    const encrypted = encryptWebPushCredentials(plaintext, { active });
    await context.adminPool.query(
      `INSERT INTO web_push_subscriptions
         (id, audience, endpoint_fingerprint, endpoint_ciphertext,
          p256dh_ciphertext, auth_ciphertext, encryption_key_version, locale,
          staff_auth_session_id, updated_at)
       VALUES ($1, 'EMPLOYEE', $2, $3, $4, $5, $6, 'en', $7, now())`,
      [
        subscriptionId,
        fingerprintWebPushEndpoint(plaintext.endpoint, Buffer.alloc(32, 12)),
        encrypted.endpointCiphertext,
        encrypted.p256dhCiphertext,
        encrypted.authCiphertext,
        encrypted.encryptionKeyVersion,
        staffSessionId,
      ],
    );
    const persisted = await context.adminPool.query<{
      auth_ciphertext: string;
      encryption_key_version: string;
      endpoint_ciphertext: string;
      id: string;
      p256dh_ciphertext: string;
    }>(
      `SELECT id::text, endpoint_ciphertext, p256dh_ciphertext,
              auth_ciphertext, encryption_key_version
       FROM web_push_subscriptions WHERE id = $1`,
      [subscriptionId],
    );
    const row = persisted.rows[0]!;
    const stored = {
      authCiphertext: row.auth_ciphertext,
      encryptionKeyVersion: row.encryption_key_version,
      endpointCiphertext: row.endpoint_ciphertext,
      p256dhCiphertext: row.p256dh_ciphertext,
      subscriptionId: row.id,
    };
    expect(decryptWebPushCredentials(stored, { active })).toEqual({
      auth: plaintext.auth,
      endpoint: plaintext.endpoint,
      p256dh: plaintext.p256dh,
    });
    expect(() =>
      decryptWebPushCredentials(
        { ...stored, subscriptionId: randomUUID() },
        { active },
      ),
    ).toThrow(WebPushDecryptionError);
  });
});
