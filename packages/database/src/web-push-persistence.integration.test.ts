import { randomUUID } from "node:crypto";

import type { DatabaseError } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PaymentCollectionDatabaseContext } from "./payment-collection-database-context.js";

const context = new PaymentCollectionDatabaseContext();

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function foundationFixture() {
  const fixture = await context.createPayment();
  const user = await context.client.query<{ user_id: string }>(
    `SELECT user_id::text FROM organization_memberships
     WHERE organization_id = $1 LIMIT 1`,
    [fixture.organizationId],
  );
  const staffSessionId = randomUUID();
  const guestGeneration = randomUUID();
  const taskId = randomUUID();
  await context.client.query(
    `INSERT INTO staff_auth_sessions
       (id, user_id, current_access_token_hash, access_expires_at,
        absolute_expires_at, last_rotated_at)
     VALUES ($1, $2, $3, now() + interval '5 minutes',
             now() + interval '1 day', now())`,
    [
      staffSessionId,
      user.rows[0]!.user_id,
      `staff-access-sha256:v1:${"a".repeat(32)}${randomUUID().replaceAll("-", "")}`,
    ],
  );
  await context.client.query(
    `UPDATE valet_sessions SET customer_access_generation = $2 WHERE id = $1`,
    [fixture.sessionId, guestGeneration],
  );
  await context.client.query(
    `INSERT INTO tasks
       (id, organization_id, location_id, valet_session_id, task_type,
        updated_at)
     VALUES ($1, $2, $3, $4, 'RETRIEVAL', now())`,
    [taskId, fixture.organizationId, fixture.locationId, fixture.sessionId],
  );
  return { ...fixture, guestGeneration, staffSessionId, taskId };
}

async function insertSubscription(input: {
  audience: "EMPLOYEE" | "GUEST";
  credentials?: {
    auth: string | null;
    endpoint: string | null;
    keyVersion: string | null;
    p256dh: string | null;
  };
  disabledAt?: Date | null;
  disabledReason?: string | null;
  endpointFingerprint?: string;
  guestGeneration?: string | null;
  guestSessionId?: string | null;
  id?: string;
  staffSessionId?: string | null;
}) {
  const id = input.id ?? randomUUID();
  const envelope = (keyVersion: string, marker: string) =>
    JSON.stringify({
      version: 1,
      keyVersion,
      iv: marker.repeat(16),
      authTag: marker.repeat(22),
      ciphertext: marker.repeat(24),
    });
  const credentials = input.credentials ?? {
    auth: envelope("active-1", "a"),
    endpoint: envelope("active-1", "e"),
    keyVersion: "active-1",
    p256dh: envelope("active-1", "p"),
  };
  await context.client.query(
    `INSERT INTO web_push_subscriptions
       (id, audience, endpoint_fingerprint, endpoint_ciphertext,
        p256dh_ciphertext, auth_ciphertext, encryption_key_version, locale,
        staff_auth_session_id, guest_valet_session_id,
        guest_access_generation, disabled_at, disabled_reason, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'en', $8, $9, $10, $11, $12,
             now())`,
    [
      id,
      input.audience,
      input.endpointFingerprint ??
        `hmac-sha256:v1:${randomUUID().replaceAll("-", "")}${"a".repeat(32)}`,
      credentials.endpoint,
      credentials.p256dh,
      credentials.auth,
      credentials.keyVersion,
      input.staffSessionId ?? null,
      input.guestSessionId ?? null,
      input.guestGeneration ?? null,
      input.disabledAt ?? null,
      input.disabledReason ?? null,
    ],
  );
  return id;
}

async function expectRejected(operation: Promise<unknown>, code: string) {
  try {
    await operation;
    throw new Error("Expected database rejection.");
  } catch (error) {
    expect((error as DatabaseError).code).toBe(code);
  }
}

describe("DEC-071 Web Push persistence foundation", () => {
  it("enforces exact Employee and Guest principal shapes", async () => {
    const fixture = await foundationFixture();
    await expect(
      insertSubscription({
        audience: "EMPLOYEE",
        staffSessionId: fixture.staffSessionId,
      }),
    ).resolves.toBeDefined();
    await expect(
      insertSubscription({
        audience: "GUEST",
        guestGeneration: fixture.guestGeneration,
        guestSessionId: fixture.sessionId,
      }),
    ).resolves.toBeDefined();
    await expectRejected(insertSubscription({ audience: "EMPLOYEE" }), "23514");
    await expectRejected(
      insertSubscription({
        audience: "GUEST",
        guestGeneration: fixture.guestGeneration,
        guestSessionId: fixture.sessionId,
        staffSessionId: fixture.staffSessionId,
      }),
      "23514",
    );
  });

  it("keeps active endpoint ownership exclusive but supports distinct devices", async () => {
    const fixture = await foundationFixture();
    const fingerprint = `hmac-sha256:v1:${randomUUID().replaceAll("-", "")}${"a".repeat(32)}`;
    await insertSubscription({
      audience: "EMPLOYEE",
      endpointFingerprint: fingerprint,
      staffSessionId: fixture.staffSessionId,
    });
    await expectRejected(
      insertSubscription({
        audience: "GUEST",
        endpointFingerprint: fingerprint,
        guestGeneration: fixture.guestGeneration,
        guestSessionId: fixture.sessionId,
      }),
      "23505",
    );
    await expect(
      insertSubscription({
        audience: "EMPLOYEE",
        staffSessionId: fixture.staffSessionId,
      }),
    ).resolves.toBeDefined();
  });

  it("allows credential-erased tombstones without deleting history", async () => {
    const fixture = await foundationFixture();
    const id = await insertSubscription({
      audience: "EMPLOYEE",
      staffSessionId: fixture.staffSessionId,
    });
    await context.client.query(
      `UPDATE web_push_subscriptions
       SET endpoint_ciphertext = NULL, p256dh_ciphertext = NULL,
           auth_ciphertext = NULL, encryption_key_version = NULL,
           disabled_at = now(), disabled_reason = 'UNSUBSCRIBED',
           updated_at = now()
       WHERE id = $1`,
      [id],
    );
    const row = await context.client.query<{
      endpoint_ciphertext: string | null;
      endpoint_fingerprint: string;
    }>(
      `SELECT endpoint_ciphertext, endpoint_fingerprint
       FROM web_push_subscriptions WHERE id = $1`,
      [id],
    );
    expect(row.rows[0]).toMatchObject({ endpoint_ciphertext: null });
    expect(row.rows[0]!.endpoint_fingerprint).toMatch(/^hmac-sha256:v1:/);
  });

  it("enforces stable intent and per-subscription delivery uniqueness", async () => {
    const fixture = await foundationFixture();
    const subscriptionId = await insertSubscription({
      audience: "EMPLOYEE",
      staffSessionId: fixture.staffSessionId,
    });
    const intentId = randomUUID();
    const insertIntent = (id: string) =>
      context.client.query(
        `INSERT INTO web_push_delivery_intents
           (id, presentation_type, task_id, occurred_at, expires_at)
         VALUES ($1, 'EMPLOYEE_RETRIEVAL_REQUESTED', $2, now(),
                 now() + interval '5 minutes')`,
        [id, fixture.taskId],
      );
    await insertIntent(intentId);
    await expectRejected(insertIntent(randomUUID()), "23505");
    const insertDelivery = (id: string) =>
      context.client.query(
        `INSERT INTO web_push_deliveries
           (id, intent_id, push_subscription_id, next_attempt_at, updated_at)
         VALUES ($1, $2, $3, now(), now())`,
        [id, intentId, subscriptionId],
      );
    await insertDelivery(randomUUID());
    await expectRejected(insertDelivery(randomUUID()), "23505");
  });

  it("enforces Guest ready intent uniqueness by session and ready_at", async () => {
    const fixture = await foundationFixture();
    const readyAt = new Date("2026-08-30T12:00:00.000Z");
    const insertIntent = (id: string, at: Date) =>
      context.client.query(
        `INSERT INTO web_push_delivery_intents
         (id, presentation_type, valet_session_id, guest_ready_at,
            occurred_at, expires_at)
         VALUES ($1, 'GUEST_VEHICLE_READY', $2, $3::timestamptz,
                 $3::timestamptz, $3::timestamptz + interval '5 minutes')`,
        [id, fixture.sessionId, at],
      );
    await insertIntent(randomUUID(), readyAt);
    await expectRejected(insertIntent(randomUUID(), readyAt), "23505");
    await expect(
      insertIntent(randomUUID(), new Date(readyAt.getTime() + 1_000)),
    ).resolves.toBeDefined();
  });
});
