import { randomUUID } from "node:crypto";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { StaffPushDeliveryWorker } from "../src/modules/staff-push/staff-push-delivery-worker";
import { runProviderIndependentStaffPushMaintenance } from "../src/modules/staff-push/staff-push-maintenance";
import type {
  StaffPushObservation,
  StaffPushObserver,
} from "../src/modules/staff-push/staff-push-observability";
import type { StaffPushProvider } from "../src/modules/staff-push/staff-push-provider";
import { RetrievalPushTestContext } from "./retrieval-push-test-context";
import { syntheticStaffPushPolicy } from "./staff-push-policy-test-value";
import { providerSendResult } from "./staff-push-provider-test-value";

const context = new RetrievalPushTestContext("worker_eligibility");
const policy = { ...syntheticStaffPushPolicy, sendingEnabled: true };
type PreparedFixture = Awaited<ReturnType<typeof prepared>>;
let provider: StaffPushProvider;
let send: ReturnType<typeof vi.fn<StaffPushProvider["send"]>>;
let observations: StaffPushObservation[];

async function prepared() {
  const fixture = await context.createGuestParkedFixture();
  const registration = await context.addRegistration(fixture.userId);
  await context.request(fixture);
  const rows = await context.adminPool.query<{
    delivery_id: string;
    intent_id: string;
    task_id: string;
  }>(
    `SELECT delivery.id AS delivery_id, intent.id AS intent_id, intent.task_id
     FROM staff_push_deliveries AS delivery
     INNER JOIN staff_push_intents AS intent ON intent.id = delivery.intent_id
     WHERE intent.valet_session_id = $1`,
    [fixture.sessionId],
  );
  return { ...fixture, ...registration, ...rows.rows[0]! };
}

function worker() {
  const observer: StaffPushObserver = {
    observe(value) {
      observations.push(value);
    },
  };
  return new StaffPushDeliveryWorker(
    context.runtimePool,
    policy,
    provider,
    observer,
    () => 0.5,
  );
}

async function state(deliveryId: string): Promise<string> {
  const result = await context.adminPool.query<{ state: string }>(
    "SELECT state::text FROM staff_push_deliveries WHERE id = $1",
    [deliveryId],
  );
  return result.rows[0]!.state;
}

beforeAll(() => context.setup(), 120_000);
beforeEach(async () => {
  await context.adminPool.query("DELETE FROM staff_push_deliveries");
  await context.adminPool.query("DELETE FROM staff_push_intents");
  await context.adminPool.query("DELETE FROM staff_push_registrations");
  send = vi.fn<StaffPushProvider["send"]>().mockResolvedValue({
    ...providerSendResult({ resultClass: "ACCEPTED" }),
  });
  provider = { send };
  observations = [];
});
afterAll(() => context.teardown(), 60_000);

describe("Staff Push send-time eligibility", () => {
  it("sends for the exact current employee scope and accepts provider-only attention", async () => {
    const fixture = await prepared();
    await expect(worker().runOnce()).resolves.toBe(true);
    expect(send).toHaveBeenCalledOnce();
    expect(await state(fixture.delivery_id)).toBe("PROVIDER_ACCEPTED");
    expect(observations).toEqual(
      expect.arrayContaining([
        { attempt: "1", event: "CLAIM", reclaimed: false },
        { event: "PROVIDER_RESULT", resultClass: "ACCEPTED" },
      ]),
    );
  });

  const negativeCases: [string, (fixture: PreparedFixture) => Promise<void>][] =
    [
      [
        "revoked session",
        async (f) =>
          void (await context.adminPool.query(
            "UPDATE staff_auth_sessions SET revoked_at = clock_timestamp() WHERE id = $1",
            [f.sessionId],
          )),
      ],
      [
        "expired session",
        async (f) =>
          void (await context.adminPool.query(
            "UPDATE staff_auth_sessions SET created_at = clock_timestamp() - interval '2 hours', last_rotated_at = clock_timestamp() - interval '2 hours', access_expires_at = clock_timestamp() - interval '1 hour', absolute_expires_at = clock_timestamp() - interval '1 hour' WHERE id = $1",
            [f.sessionId],
          )),
      ],
      [
        "disabled User",
        async (f) =>
          void (await context.adminPool.query(
            "UPDATE users SET status = 'DISABLED' WHERE id = $1",
            [f.userId],
          )),
      ],
      [
        "inactive membership",
        async (f) =>
          void (await context.adminPool.query(
            "UPDATE organization_memberships SET status = 'INACTIVE' WHERE id = $1",
            [f.membershipId],
          )),
      ],
      [
        "wrong role",
        async (f) =>
          void (await context.adminPool.query(
            "UPDATE organization_memberships SET role = 'LOCATION_MANAGER' WHERE id = $1",
            [f.membershipId],
          )),
      ],
      [
        "inactive Organization",
        async (f) =>
          void (await context.adminPool.query(
            "UPDATE organizations SET status = 'INACTIVE' WHERE id = $1",
            [f.organizationId],
          )),
      ],
      [
        "inactive Location",
        async (f) =>
          void (await context.adminPool.query(
            "UPDATE locations SET status = 'INACTIVE', accepting_intake = FALSE WHERE id = $1",
            [f.locationId],
          )),
      ],
      [
        "removed LocationAccess",
        async (f) =>
          void (await context.adminPool.query(
            "DELETE FROM membership_location_access WHERE membership_id = $1 AND location_id = $2",
            [f.membershipId, f.locationId],
          )),
      ],
      [
        "ended Shift",
        async (f) =>
          void (await context.adminPool.query(
            "UPDATE shifts SET status = 'ENDED', ended_at = clock_timestamp() WHERE membership_id = $1",
            [f.membershipId],
          )),
      ],
      [
        "assigned Task",
        async (f) =>
          void (await context.adminPool.query(
            "UPDATE tasks SET current_assignee_membership_id = $2, status = 'ASSIGNED' WHERE id = $1",
            [f.task_id, f.membershipId],
          )),
      ],
      [
        "non-QUEUED Task",
        async (f) =>
          void (await context.adminPool.query(
            "UPDATE tasks SET status = 'CANCELLED' WHERE id = $1",
            [f.task_id],
          )),
      ],
      [
        "non-RETRIEVAL Task",
        async (f) =>
          void (await context.adminPool.query(
            "UPDATE tasks SET task_type = 'PARKING' WHERE id = $1",
            [f.task_id],
          )),
      ],
      ...(["DISABLED", "SUPERSEDED", "PROVIDER_INVALID"] as const).map(
        (
          registrationState,
        ): [string, (fixture: PreparedFixture) => Promise<void>] => [
          `${registrationState} registration`,
          async (f: PreparedFixture) => {
            let successor: string | null = null;
            if (registrationState === "SUPERSEDED") {
              successor = randomUUID();
              await context.adminPool.query(
                `INSERT INTO staff_push_registrations
                 (id, staff_auth_session_id, provider, platform, app_identifier,
                  installation_id, provider_token, token_hash, app_version, app_build, locale)
               SELECT $1, staff_auth_session_id, provider, platform, app_identifier,
                      gen_random_uuid(), 'replacement-token',
                      'staff-push-token-sha256:v1:' || repeat('a', 64),
                      app_version, app_build, locale
               FROM staff_push_registrations WHERE id = $2`,
                [successor, f.registrationId],
              );
            }
            await context.adminPool.query(
              `UPDATE staff_push_registrations
             SET state = $2, provider_token = NULL, terminal_at = clock_timestamp(),
                 terminal_reason_class = 'TEST', superseded_by_registration_id = $3
             WHERE id = $1`,
              [f.registrationId, registrationState, successor],
            );
          },
        ],
      ),
    ];

  it.each(negativeCases)(
    "suppresses %s without provider I/O",
    async (_name, invalidate) => {
      const fixture = await prepared();
      await invalidate(fixture);
      await worker().runOnce();
      expect(send).not.toHaveBeenCalled();
      expect(await state(fixture.delivery_id)).toBe("SUPPRESSED");
    },
  );

  it("expires an intent without provider I/O", async () => {
    const fixture = await prepared();
    const client = await context.adminPool.connect();
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(
      `UPDATE staff_push_intents
       SET created_at = clock_timestamp() - interval '2 seconds',
           expires_at = clock_timestamp() - interval '1 second'
       WHERE id = $1`,
      [fixture.intent_id],
    );
    await client.query("COMMIT");
    client.release();
    await worker().runOnce();
    await runProviderIndependentStaffPushMaintenance(
      context.runtimePool,
      policy,
    );
    expect(send).not.toHaveBeenCalled();
    expect(await state(fixture.delivery_id)).toBe("EXPIRED");
  });
});
