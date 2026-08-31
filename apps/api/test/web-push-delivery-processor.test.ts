import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import type { WebPushStorageKeyring } from "../src/common/web-push/subscription-crypto";
import type { WebPushSender } from "../src/modules/web-push-delivery/web-push-sender";
import type {
  ClaimedWebPushDelivery,
  PreparedWebPushDelivery,
} from "../src/modules/web-push-delivery/web-push-delivery-types";

const repository = vi.hoisted(() => ({
  prepareWebPushDelivery: vi.fn(),
}));
const state = vi.hoisted(() => ({
  finalizeGoneWebPushDelivery: vi.fn(),
  finalizeWebPushDelivery: vi.fn(),
  retryWebPushDelivery: vi.fn(),
}));

vi.mock(
  "../src/modules/web-push-delivery/web-push-delivery-repository",
  () => repository,
);
vi.mock(
  "../src/modules/web-push-delivery/web-push-delivery-state",
  () => state,
);

import { WebPushDeliveryProcessor } from "../src/modules/web-push-delivery/web-push-delivery-processor";

const claim: ClaimedWebPushDelivery = {
  attemptCount: 1,
  deliveryId: "delivery-1",
  leaseToken: "exact-live-lease-token",
};
const expiresAt = new Date("2026-08-31T10:00:10.000Z");
const delivery: PreparedWebPushDelivery = {
  audience: "EMPLOYEE",
  attemptCount: 1,
  auth: "auth",
  deliveryId: claim.deliveryId,
  endpoint: "https://push.example.test/subscription",
  expiresAt,
  intentId: "intent-1",
  locale: "en",
  p256dh: "p256dh",
  presentationType: "EMPLOYEE_RETRIEVAL_REQUESTED",
  readyAt: null,
  subscriptionId: "subscription-1",
  subscriptionSnapshot: {
    authCiphertext: "auth-ciphertext",
    endpointCiphertext: "endpoint-ciphertext",
    endpointFingerprint: "endpoint-fingerprint",
    encryptionKeyVersion: "key-v1",
    p256dhCiphertext: "p256dh-ciphertext",
  },
  taskId: "10000000-0000-4000-8000-000000000001",
  valetSessionId: null,
};
const pool = {} as PostgresPool;
const keyring = {} as WebPushStorageKeyring;

function processor(
  now: Date,
  send = vi.fn().mockResolvedValue({ statusCode: 201 }),
) {
  return {
    process: new WebPushDeliveryProcessor(
      pool,
      keyring,
      { send } as WebPushSender,
      () => now,
    ),
    send,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repository.prepareWebPushDelivery.mockResolvedValue(delivery);
  state.finalizeWebPushDelivery.mockResolvedValue(true);
});

describe("Web Push delivery processor send boundary", () => {
  it.each([
    ["exactly at expiry", expiresAt],
    ["after expiry", new Date(expiresAt.getTime() + 1)],
  ])("does not call the sender %s", async (_label, now) => {
    const subject = processor(now);

    await subject.process.process(claim);

    expect(subject.send).not.toHaveBeenCalled();
    expect(state.finalizeWebPushDelivery).toHaveBeenCalledWith(pool, {
      claim,
      failure: "AUTHORITY",
      status: "TERMINAL",
    });
  });

  it("uses zero provider retention when less than one second remains", async () => {
    const remainingMilliseconds = 999;
    const subject = processor(
      new Date(expiresAt.getTime() - remainingMilliseconds),
    );

    await subject.process.process(claim);

    expect(subject.send).toHaveBeenCalledWith(
      expect.objectContaining({ ttlSeconds: 0 }),
    );
    const request = subject.send.mock.calls[0]?.[0] as
      { ttlSeconds: number } | undefined;
    expect((request?.ttlSeconds ?? Infinity) * 1_000).toBeLessThanOrEqual(
      remainingMilliseconds,
    );
  });

  it("floors provider TTL without exceeding a multi-second lifetime", async () => {
    const remainingMilliseconds = 2_999;
    const subject = processor(
      new Date(expiresAt.getTime() - remainingMilliseconds),
    );

    await subject.process.process(claim);

    expect(subject.send).toHaveBeenCalledWith(
      expect.objectContaining({ ttlSeconds: 2 }),
    );
    const request = subject.send.mock.calls[0]?.[0] as
      { ttlSeconds: number } | undefined;
    expect((request?.ttlSeconds ?? Infinity) * 1_000).toBeLessThanOrEqual(
      remainingMilliseconds,
    );
  });

  it("keeps accepted delivery finalization guarded by the exact claim", async () => {
    const subject = processor(new Date(expiresAt.getTime() - 5_000));

    await subject.process.process(claim);

    expect(subject.send).toHaveBeenCalledOnce();
    expect(state.finalizeWebPushDelivery).toHaveBeenCalledWith(pool, {
      claim,
      status: "ACCEPTED",
    });
  });
});
