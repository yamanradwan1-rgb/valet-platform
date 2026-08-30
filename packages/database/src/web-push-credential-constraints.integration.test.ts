import { randomUUID } from "node:crypto";

import type { DatabaseError } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PaymentCollectionDatabaseContext } from "./payment-collection-database-context.js";

const context = new PaymentCollectionDatabaseContext();
const activeEnvelope = (marker: string, keyVersion = "active-1") =>
  JSON.stringify({
    version: 1,
    keyVersion,
    iv: marker.repeat(16),
    authTag: marker.repeat(22),
    ciphertext: marker.repeat(24),
  });
const activeCredentials = {
  auth: activeEnvelope("a"),
  endpoint: activeEnvelope("e"),
  keyVersion: "active-1" as string | null,
  p256dh: activeEnvelope("p"),
};

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function createStaffSession() {
  const fixture = await context.createPayment();
  const user = await context.client.query<{ user_id: string }>(
    `SELECT user_id::text FROM organization_memberships
     WHERE organization_id = $1 LIMIT 1`,
    [fixture.organizationId],
  );
  const staffSessionId = randomUUID();
  await context.client.query(
    `INSERT INTO staff_auth_sessions
       (id, user_id, current_access_token_hash, access_expires_at,
        absolute_expires_at, last_rotated_at)
     VALUES ($1, $2, $3, now() + interval '5 minutes',
             now() + interval '1 day', now())`,
    [
      staffSessionId,
      user.rows[0]!.user_id,
      `staff-access-sha256:v1:${randomUUID().replaceAll("-", "")}${"a".repeat(32)}`,
    ],
  );
  return staffSessionId;
}

function insertSubscription(
  staffSessionId: string,
  input: {
    credentials?: {
      auth: string | null;
      endpoint: string | null;
      keyVersion: string | null;
      p256dh: string | null;
    };
    disabledAt?: Date | null;
    disabledReason?: string | null;
  },
) {
  const credentials = input.credentials ?? activeCredentials;
  return context.client.query(
    `INSERT INTO web_push_subscriptions
       (id, audience, endpoint_fingerprint, endpoint_ciphertext,
        p256dh_ciphertext, auth_ciphertext, encryption_key_version, locale,
        staff_auth_session_id, disabled_at, disabled_reason, updated_at)
     VALUES ($1, 'EMPLOYEE', $2, $3, $4, $5, $6, 'en', $7, $8, $9, now())`,
    [
      randomUUID(),
      `hmac-sha256:v1:${randomUUID().replaceAll("-", "")}${"a".repeat(32)}`,
      credentials.endpoint,
      credentials.p256dh,
      credentials.auth,
      credentials.keyVersion,
      staffSessionId,
      input.disabledAt ?? null,
      input.disabledReason ?? null,
    ],
  );
}

async function expectRejected(operation: Promise<unknown>) {
  try {
    await operation;
    throw new Error("Expected database rejection.");
  } catch (error) {
    expect((error as DatabaseError).code).toBe("23514");
  }
}

describe("Web Push credential and tombstone constraints", () => {
  it("rejects active rows with incomplete credential sets", async () => {
    const staffSessionId = await createStaffSession();
    for (const credentials of [
      { ...activeCredentials, endpoint: null },
      { ...activeCredentials, p256dh: null },
      { ...activeCredentials, auth: null },
      { ...activeCredentials, keyVersion: null },
    ]) {
      await expectRejected(insertSubscription(staffSessionId, { credentials }));
    }
  });

  it("requires credential erasure and a reason for disabled rows", async () => {
    const staffSessionId = await createStaffSession();
    await expectRejected(
      insertSubscription(staffSessionId, {
        credentials: activeCredentials,
        disabledAt: new Date(),
        disabledReason: "UNSUBSCRIBED",
      }),
    );
    const erased = {
      auth: null,
      endpoint: null,
      keyVersion: null,
      p256dh: null,
    };
    await expectRejected(
      insertSubscription(staffSessionId, {
        credentials: erased,
        disabledAt: new Date(),
      }),
    );
    await expect(
      insertSubscription(staffSessionId, {
        credentials: erased,
        disabledAt: new Date(),
        disabledReason: "UNSUBSCRIBED",
      }),
    ).resolves.toBeDefined();
  });

  it("rejects active envelopes that disagree with the row key version", async () => {
    const staffSessionId = await createStaffSession();
    const previousEnvelope = activeEnvelope("a", "previous-1");
    await expectRejected(
      insertSubscription(staffSessionId, {
        credentials: {
          auth: previousEnvelope,
          endpoint: previousEnvelope,
          keyVersion: "active-1",
          p256dh: previousEnvelope,
        },
      }),
    );
  });
});
