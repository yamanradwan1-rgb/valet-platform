import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  encryptWebPushCredentials,
  fingerprintWebPushEndpoint,
} from "../src/common/web-push/subscription-crypto";
import {
  prepareWebPushDelivery,
  tombstoneWebPushDecryptionFailure,
} from "../src/modules/web-push-delivery/web-push-delivery-repository";
import {
  claimWebPushDeliveries,
  finalizeGoneWebPushDelivery,
  finalizeWebPushDelivery,
} from "../src/modules/web-push-delivery/web-push-delivery-state";
import {
  materializeWebPushDeliveries,
  reconcileWebPushIntents,
} from "../src/modules/web-push-delivery/web-push-reconciler";
import { disableStaleWebPushSubscriptions } from "../src/modules/web-push-delivery/web-push-delivery-cleanup";
import {
  WebPushTestContext,
  webPushTestActiveKey,
} from "./web-push-test-context";

const context = new WebPushTestContext();
const fingerprintKey = Buffer.alloc(32, 22);

async function insertSubscription(input: {
  audience: "EMPLOYEE" | "GUEST";
  guestGeneration?: string;
  guestSessionId?: string;
  sessionId?: string;
}) {
  const id = randomUUID();
  const endpoint = `https://push.test/${id}`;
  const encrypted = encryptWebPushCredentials(
    {
      auth: Buffer.alloc(16, 7).toString("base64url"),
      endpoint,
      p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 8)]).toString(
        "base64url",
      ),
      subscriptionId: id,
    },
    { active: webPushTestActiveKey },
  );
  await context.adminPool.query(
    `INSERT INTO web_push_subscriptions
       (id, audience, endpoint_fingerprint, endpoint_ciphertext,
        p256dh_ciphertext, auth_ciphertext, encryption_key_version, locale,
        staff_auth_session_id, guest_valet_session_id, guest_access_generation,
        created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'en', $8, $9, $10,
             clock_timestamp() - interval '1 minute', clock_timestamp())`,
    [
      id,
      input.audience,
      fingerprintWebPushEndpoint(endpoint, fingerprintKey),
      encrypted.endpointCiphertext,
      encrypted.p256dhCiphertext,
      encrypted.authCiphertext,
      encrypted.encryptionKeyVersion,
      input.sessionId ?? null,
      input.guestSessionId ?? null,
      input.guestGeneration ?? null,
    ],
  );
  return id;
}

beforeAll(async () => context.setup(), 120_000);
afterAll(async () => context.teardown(), 60_000);

describe("T3 Web Push durable delivery runtime", () => {
  it("skips canonical facts that are already outside the event TTL", async () => {
    const fixture = await context.createGuest();
    await context.adminPool.query(
      `UPDATE valet_sessions SET state = 'READY',
         ready_at = clock_timestamp() - interval '10 minutes',
         updated_at = clock_timestamp() WHERE id = $1`,
      [fixture.sessionId],
    );
    await context.adminPool.query(
      `INSERT INTO tasks
         (id, organization_id, location_id, valet_session_id,
          task_type, status, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'RETRIEVAL', 'QUEUED', 1,
               clock_timestamp() - interval '10 minutes', clock_timestamp())`,
      [
        randomUUID(),
        fixture.organizationId,
        fixture.locationId,
        fixture.sessionId,
      ],
    );
    expect(await reconcileWebPushIntents(context.runtimePool)).toBe(0);
  });

  it("reconciles canonical facts, filters historical bindings, and leases once", async () => {
    const fixture = await context.createGuest();
    const staffSessionId = randomUUID();
    await context.adminPool.query(
      `INSERT INTO staff_auth_sessions
         (id, user_id, current_access_token_hash, access_expires_at,
          absolute_expires_at, last_rotated_at)
       VALUES ($1, $2, $3, now() + interval '15 minutes',
               now() + interval '1 day', now())`,
      [
        staffSessionId,
        fixture.userId,
        `staff-access-sha256:v1:${createHash("sha256").update(randomUUID()).digest("hex")}`,
      ],
    );
    await context.adminPool.query(
      `INSERT INTO shifts
         (id, organization_id, location_id, membership_id, status, started_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', clock_timestamp())`,
      [
        randomUUID(),
        fixture.organizationId,
        fixture.locationId,
        fixture.membershipId,
      ],
    );
    const employeeSubscription = await insertSubscription({
      audience: "EMPLOYEE",
      sessionId: staffSessionId,
    });
    const guestSubscription = await insertSubscription({
      audience: "GUEST",
      guestGeneration: fixture.accessGeneration,
      guestSessionId: fixture.sessionId,
    });
    const taskId = randomUUID();
    await context.adminPool.query(
      `INSERT INTO tasks
         (id, organization_id, location_id, valet_session_id,
          task_type, status, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'RETRIEVAL', 'QUEUED', 1,
               clock_timestamp(), clock_timestamp())`,
      [taskId, fixture.organizationId, fixture.locationId, fixture.sessionId],
    );
    await context.adminPool.query(
      `UPDATE valet_sessions SET state = 'READY', ready_at = clock_timestamp(),
         updated_at = clock_timestamp() WHERE id = $1`,
      [fixture.sessionId],
    );

    const reconciled = await Promise.all([
      reconcileWebPushIntents(context.runtimePool),
      reconcileWebPushIntents(context.runtimePool),
    ]);
    expect(reconciled.reduce((sum, count) => sum + count, 0)).toBe(2);
    expect(await reconcileWebPushIntents(context.runtimePool)).toBe(0);
    expect(await materializeWebPushDeliveries(context.runtimePool)).toBe(2);

    const late = await insertSubscription({
      audience: "EMPLOYEE",
      sessionId: staffSessionId,
    });
    await context.adminPool.query(
      `UPDATE web_push_subscriptions SET created_at = clock_timestamp() + interval '1 minute'
       WHERE id = $1`,
      [late],
    );
    expect(await materializeWebPushDeliveries(context.runtimePool)).toBe(0);

    const [first, second] = await Promise.all([
      claimWebPushDeliveries(context.runtimePool),
      claimWebPushDeliveries(context.runtimePool),
    ]);
    const claims = [...first, ...second];
    expect(claims).toHaveLength(2);
    expect(new Set(claims.map((claim) => claim.deliveryId)).size).toBe(2);
    expect(await claimWebPushDeliveries(context.runtimePool)).toHaveLength(0);
    const staleClaim = claims[0]!;
    await context.adminPool.query(
      `UPDATE web_push_deliveries
       SET lease_expires_at = clock_timestamp() - interval '1 second'
       WHERE id = $1`,
      [staleClaim.deliveryId],
    );
    const recovered = await claimWebPushDeliveries(context.runtimePool);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({
      attemptCount: staleClaim.attemptCount + 1,
      deliveryId: staleClaim.deliveryId,
    });
    expect(recovered[0]!.leaseToken).not.toBe(staleClaim.leaseToken);
    expect(
      await finalizeWebPushDelivery(context.runtimePool, {
        claim: staleClaim,
        status: "ACCEPTED",
      }),
    ).toBe(false);
    claims[0] = recovered[0]!;

    await context.adminPool.query(
      `UPDATE shifts SET status = 'ENDED', ended_at = clock_timestamp()
       WHERE organization_id = $1`,
      [fixture.organizationId],
    );

    const prepared = await Promise.all(
      claims.map((claim) =>
        prepareWebPushDelivery(
          context.runtimePool,
          { active: webPushTestActiveKey },
          claim,
        ),
      ),
    );
    expect(prepared.filter(Boolean)).toHaveLength(1);
    const oldGuest = prepared.find(
      (delivery) => delivery?.audience === "GUEST",
    )!;
    expect(oldGuest).toMatchObject({
      presentationType: "GUEST_VEHICLE_READY",
      subscriptionId: guestSubscription,
    });
    const guestIndex = prepared.indexOf(oldGuest);
    const oldClaim = claims[guestIndex]!;

    const replacementEndpoint = `https://push.test/replaced-${randomUUID()}`;
    const replacement = encryptWebPushCredentials(
      {
        auth: Buffer.alloc(16, 9).toString("base64url"),
        endpoint: replacementEndpoint,
        p256dh: Buffer.concat([
          Buffer.from([4]),
          Buffer.alloc(64, 10),
        ]).toString("base64url"),
        subscriptionId: guestSubscription,
      },
      { active: webPushTestActiveKey },
    );
    await context.adminPool.query(
      `UPDATE web_push_subscriptions SET endpoint_fingerprint = $2,
         endpoint_ciphertext = $3, p256dh_ciphertext = $4,
         auth_ciphertext = $5, encryption_key_version = $6,
         updated_at = clock_timestamp() WHERE id = $1`,
      [
        guestSubscription,
        fingerprintWebPushEndpoint(replacementEndpoint, fingerprintKey),
        replacement.endpointCiphertext,
        replacement.p256dhCiphertext,
        replacement.authCiphertext,
        replacement.encryptionKeyVersion,
      ],
    );
    const cleanupTransaction = await context.runtimePool.connect();
    try {
      await cleanupTransaction.query("BEGIN");
      expect(
        await tombstoneWebPushDecryptionFailure(
          cleanupTransaction,
          guestSubscription,
          oldGuest.subscriptionSnapshot,
        ),
      ).toBe(false);
      await cleanupTransaction.query("COMMIT");
    } finally {
      cleanupTransaction.release();
    }
    expect(
      await finalizeGoneWebPushDelivery(
        context.runtimePool,
        oldClaim,
        guestSubscription,
        oldGuest.subscriptionSnapshot,
      ),
    ).toBe(true);
    const replacementRow = await context.subscription(guestSubscription);
    expect(replacementRow.disabled_at).toBeNull();
    expect(replacementRow.endpoint_ciphertext).toBe(
      replacement.endpointCiphertext,
    );

    expect(await disableStaleWebPushSubscriptions(context.runtimePool)).toBe(0);
    expect(
      (await context.subscription(employeeSubscription)).disabled_at,
    ).toBeNull();
    await context.adminPool.query(
      `UPDATE valet_sessions SET customer_access_generation = $2,
         updated_at = clock_timestamp() WHERE id = $1`,
      [fixture.sessionId, randomUUID()],
    );
    expect(await disableStaleWebPushSubscriptions(context.runtimePool)).toBe(1);
    expect(await context.subscription(guestSubscription)).toMatchObject({
      auth_ciphertext: null,
      disabled_reason: "GUEST_ACCESS_CHANGED",
      encryption_key_version: null,
    });
  });
});
