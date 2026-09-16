import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { lockManagementSettingsOrganization } from "../src/common/database/management-settings-lock";
import { StaffPushDeliveryWorker } from "../src/modules/staff-push/staff-push-delivery-worker";
import type { StaffPushProvider } from "../src/modules/staff-push/staff-push-provider";
import { providerSendResult } from "./staff-push-provider-test-value";
import { syntheticStaffPushPolicy } from "./staff-push-policy-test-value";
import { RetrievalPushTestContext } from "./retrieval-push-test-context";

const context = new RetrievalPushTestContext("management_policy_race");
const policy = { ...syntheticStaffPushPolicy, sendingEnabled: true };

async function prepared() {
  const fixture = await context.createGuestParkedFixture();
  await context.addRegistration(fixture.userId);
  await context.request(fixture);
  const delivery = await context.adminPool.query<{ id: string }>(
    `SELECT delivery.id
     FROM staff_push_deliveries AS delivery
     INNER JOIN staff_push_intents AS intent ON intent.id = delivery.intent_id
     WHERE intent.valet_session_id = $1`,
    [fixture.sessionId],
  );
  return { ...fixture, deliveryId: delivery.rows[0]!.id };
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

async function deliveryState(deliveryId: string): Promise<string> {
  const result = await context.adminPool.query<{ state: string }>(
    "SELECT state::text FROM staff_push_deliveries WHERE id = $1",
    [deliveryId],
  );
  return result.rows[0]!.state;
}

async function waitForSharedAdvisoryWait(): Promise<void> {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const result = await context.adminPool.query<{ waiting: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_locks AS waiting
         WHERE waiting.locktype = 'advisory'
           AND waiting.database = (
             SELECT oid FROM pg_database WHERE datname = current_database()
           )
           AND waiting.mode = 'ShareLock'
           AND NOT waiting.granted
       ) AS waiting`,
    );
    if (result.rows[0]?.waiting === true) return;
  }
  throw new Error(
    "Worker did not wait on the shared Management settings lock.",
  );
}

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("MGT-BE-05 Staff Push notification policy races", () => {
  it("suppresses without provider I/O when a disabling writer wins first", async () => {
    const fixture = await prepared();
    const writer = await context.adminPool.connect();
    let committed = false;
    const send = vi
      .fn<StaffPushProvider["send"]>()
      .mockResolvedValue(providerSendResult({ resultClass: "ACCEPTED" }));
    try {
      await writer.query("BEGIN");
      await lockManagementSettingsOrganization(
        writer,
        fixture.organizationId,
        "EXCLUSIVE",
      );
      await writer.query(
        `UPDATE organizations
         SET employee_retrieval_requested_notification_enabled = FALSE,
             updated_at = clock_timestamp()
         WHERE id = $1`,
        [fixture.organizationId],
      );

      const run = worker({ send }).runOnce();
      await waitForSharedAdvisoryWait();
      await writer.query("COMMIT");
      committed = true;

      await expect(run).resolves.toBe(true);
      expect(send).not.toHaveBeenCalled();
      expect(await deliveryState(fixture.deliveryId)).toBe("SUPPRESSED");
    } finally {
      if (!committed) await writer.query("ROLLBACK").catch(() => undefined);
      writer.release();
    }
  });

  it("releases the settings lock before provider I/O when the worker wins first", async () => {
    const fixture = await prepared();
    let enterProvider!: () => void;
    let releaseProvider!: () => void;
    const providerEntered = new Promise<void>((resolve) => {
      enterProvider = resolve;
    });
    const providerReleased = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const send = vi
      .fn<StaffPushProvider["send"]>()
      .mockImplementation(async (request) => {
        expect(request.messageForTransport()).toBeDefined();
        enterProvider();
        await providerReleased;
        return providerSendResult({ resultClass: "ACCEPTED" });
      });
    const run = worker({ send }).runOnce();
    await providerEntered;

    const writer = await context.adminPool.connect();
    let committed = false;
    try {
      await writer.query("BEGIN");
      await writer.query("SET LOCAL lock_timeout = '500ms'");
      await lockManagementSettingsOrganization(
        writer,
        fixture.organizationId,
        "EXCLUSIVE",
      );
      await writer.query(
        `UPDATE organizations
         SET employee_retrieval_requested_notification_enabled = FALSE,
             updated_at = clock_timestamp()
         WHERE id = $1`,
        [fixture.organizationId],
      );
      await writer.query("COMMIT");
      committed = true;
    } finally {
      if (!committed) await writer.query("ROLLBACK").catch(() => undefined);
      writer.release();
      releaseProvider();
    }

    await expect(run).resolves.toBe(true);
    expect(send).toHaveBeenCalledOnce();
    expect(await deliveryState(fixture.deliveryId)).toBe("PROVIDER_ACCEPTED");
  });
});
