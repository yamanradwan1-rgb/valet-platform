import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { FcmHttpV1Adapter } from "../src/modules/staff-push/fcm-http-v1-adapter";
import { StaffPushDeliveryWorker } from "../src/modules/staff-push/staff-push-delivery-worker";
import type { StaffPushProvider } from "../src/modules/staff-push/staff-push-provider";
import { RetrievalPushTestContext } from "./retrieval-push-test-context";
import { syntheticStaffPushPolicy } from "./staff-push-policy-test-value";

const context = new RetrievalPushTestContext("issue357_fcm_token_delay");
const policy = { ...syntheticStaffPushPolicy, sendingEnabled: true };
const fcmConfig = { projectId: "vaylet-test-fcm", timeoutMilliseconds: 10_000 };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function acceptedFetch() {
  return vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    expect(init?.method).toBe("POST");
    return new Response('{"name":"projects/vaylet-test-fcm/messages/mock"}', {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

function worker(provider: StaffPushProvider) {
  return new StaffPushDeliveryWorker(
    context.runtimePool,
    policy,
    provider,
    { observe: () => undefined },
    () => 0.5,
  );
}

async function deliveryRow(deliveryId: string) {
  const result = await context.adminPool.query<{
    attempt_count: number;
    lease_token: string | null;
    state: string;
  }>(
    `SELECT state::text, attempt_count, lease_token::text
     FROM staff_push_deliveries WHERE id = $1`,
    [deliveryId],
  );
  return result.rows[0]!;
}

async function prepared() {
  const fixture = await context.createGuestParkedFixture();
  await context.addRegistration(fixture.userId);
  await context.request(fixture);
  const result = await context.adminPool.query<{ id: string }>(
    `SELECT delivery.id FROM staff_push_deliveries AS delivery
     JOIN staff_push_intents AS intent ON intent.id = delivery.intent_id
     WHERE intent.valet_session_id = $1`,
    [fixture.sessionId],
  );
  expect(result.rowCount).toBe(1);
  return result.rows[0]!.id;
}

async function expireLease(deliveryId: string) {
  // Backdate the real SQL lease in this disposable test database only.
  const client = await context.adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(
      `UPDATE staff_push_deliveries
       SET lease_expires_at = clock_timestamp() - interval '1 second'
       WHERE id = $1`,
      [deliveryId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("#357 FCM OAuth wait versus actual PostgreSQL lease", () => {
  it("rejects stale pre-POST transport after another worker reclaims during OAuth", async () => {
    const deliveryId = await prepared();
    const oauthEntered = deferred();
    const releaseOAuth = deferred();
    const fetchA = acceptedFetch();
    const fetchB = acceptedFetch();
    const providerA = new FcmHttpV1Adapter(
      fcmConfig,
      {
        accessToken: async () => {
          oauthEntered.resolve();
          await releaseOAuth.promise;
          return "synthetic-token-a";
        },
      },
      fetchA,
    );
    const providerB = new FcmHttpV1Adapter(
      fcmConfig,
      { accessToken: async () => "synthetic-token-b" },
      fetchB,
    );

    const runA = worker(providerA).runOnce();
    await oauthEntered.promise;
    try {
      expect(await deliveryRow(deliveryId)).toMatchObject({
        attempt_count: 1,
        state: "LEASED",
      });
      expect(fetchA).not.toHaveBeenCalled();
      await expireLease(deliveryId);
      expect(await worker(providerB).runOnce()).toBe(true);
      expect(fetchB).toHaveBeenCalledOnce();
      expect(await deliveryRow(deliveryId)).toMatchObject({
        attempt_count: 2,
        lease_token: null,
        state: "PROVIDER_ACCEPTED",
      });
    } finally {
      releaseOAuth.resolve();
    }
    await expect(runA).resolves.toBe(true);
    expect(fetchA).not.toHaveBeenCalled();
    expect(fetchB).toHaveBeenCalledOnce();
  });
});
