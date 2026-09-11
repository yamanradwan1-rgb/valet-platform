import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { persistRetrievalPushAttention } from "../src/modules/staff-push/retrieval-push-attention-writer";
import { StaffPushDeliveryWorker } from "../src/modules/staff-push/staff-push-delivery-worker";
import { RetrievalPushTestContext } from "./retrieval-push-test-context";
import { syntheticStaffPushPolicy } from "./staff-push-policy-test-value";

const context = new RetrievalPushTestContext("invalid_endpoint");
const policy = { ...syntheticStaffPushPolicy, sendingEnabled: true };

async function prepared() {
  const fixture = await context.createGuestParkedFixture();
  const registration = await context.addRegistration(fixture.userId);
  await context.request(fixture);
  const delivery = await context.adminPool.query<{ id: string }>(
    `SELECT delivery.id FROM staff_push_deliveries AS delivery
     INNER JOIN staff_push_intents AS intent ON intent.id = delivery.intent_id
     WHERE intent.valet_session_id = $1`,
    [fixture.sessionId],
  );
  return { ...fixture, ...registration, deliveryId: delivery.rows[0]!.id };
}

function invalidWorker(afterProviderResult = async () => undefined) {
  return new StaffPushDeliveryWorker(
    context.runtimePool,
    policy,
    { send: async () => ({ resultClass: "INVALID_ENDPOINT" }) },
    { observe: () => undefined },
    Math.random,
    () => new Date(),
    afterProviderResult,
  );
}

beforeAll(() => context.setup(), 120_000);
beforeEach(async () => {
  await context.adminPool.query("DELETE FROM staff_push_deliveries");
  await context.adminPool.query("DELETE FROM staff_push_intents");
  await context.adminPool.query("DELETE FROM staff_push_registrations");
});
afterAll(() => context.teardown(), 60_000);

describe("Staff Push invalid endpoint fencing", () => {
  it("invalidates only the exact endpoint and suppresses its unsent work", async () => {
    const fixture = await prepared();
    const secondSessionId = await context.addSession(fixture, "REQUESTED");
    const secondTask = await context.createRetrievalTask({
      ...fixture,
      sessionId: secondSessionId,
    });
    await inPostgresTransaction(context.runtimePool, (transaction) =>
      persistRetrievalPushAttention(
        transaction,
        {
          locationId: fixture.locationId,
          organizationId: fixture.organizationId,
          taskId: secondTask.taskId,
          valetSessionId: secondSessionId,
        },
        new Date(),
        policy.employeeRetrievalRequested,
      ),
    );
    await invalidWorker().runOnce();
    const registration = await context.adminPool.query<{
      provider_token: string | null;
      state: string;
    }>(
      "SELECT state::text, provider_token FROM staff_push_registrations WHERE id = $1",
      [fixture.registrationId],
    );
    expect(registration.rows[0]).toEqual({
      provider_token: null,
      state: "PROVIDER_INVALID",
    });
    const deliveries = await context.adminPool.query<{
      id: string;
      provider_result_class: string | null;
      state: string;
    }>(
      `SELECT delivery.id, delivery.state::text,
              delivery.provider_result_class::text
       FROM staff_push_deliveries AS delivery
       WHERE delivery.registration_id = $1 ORDER BY delivery.created_at`,
      [fixture.registrationId],
    );
    expect(deliveries.rows).toEqual([
      {
        id: fixture.deliveryId,
        provider_result_class: "INVALID_ENDPOINT",
        state: "PERMANENT_FAILURE",
      },
      expect.objectContaining({ state: "SUPPRESSED" }),
    ]);
  });

  it("protects a concurrently rotated endpoint from an old invalid result", async () => {
    const fixture = await prepared();
    const successorId = randomUUID();
    const newToken = "replacement-token";
    const newHash = `staff-push-token-sha256:v1:${createHash("sha256")
      .update(newToken)
      .digest("hex")}`;
    await invalidWorker(async () => {
      const client = await context.adminPool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE staff_push_registrations
           SET state = 'SUPERSEDED', provider_token = NULL,
               terminal_at = clock_timestamp(), terminal_reason_class = 'TOKEN_ROTATION',
               superseded_by_registration_id = $2, updated_at = clock_timestamp()
           WHERE id = $1`,
          [fixture.registrationId, successorId],
        );
        await client.query(
          `INSERT INTO staff_push_registrations
             (id, staff_auth_session_id, provider, platform, app_identifier,
              installation_id, provider_token, token_hash, app_version, app_build, locale)
           VALUES ($1, $2, 'FCM', 'ANDROID', 'com.vaylet.employee', $3, $4, $5,
                   'new', 'new', 'en')`,
          [successorId, fixture.sessionId, randomUUID(), newToken, newHash],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }).runOnce();
    const registrations = await context.adminPool.query<{
      id: string;
      provider_token: string | null;
      state: string;
    }>(
      "SELECT id, state::text, provider_token FROM staff_push_registrations ORDER BY id",
    );
    expect(registrations.rows).toEqual(
      expect.arrayContaining([
        {
          id: fixture.registrationId,
          provider_token: null,
          state: "SUPERSEDED",
        },
        { id: successorId, provider_token: newToken, state: "ACTIVE" },
      ]),
    );
  });
});
