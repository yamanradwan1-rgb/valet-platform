import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  claim: vi.fn(),
  claimExpired: vi.fn(),
  eligible: vi.fn(),
  finalize: vi.fn(),
  invalidEndpoint: vi.fn(),
  retry: vi.fn(),
}));

vi.mock("../src/modules/guest-push/guest-push-claim-repository", () => ({
  claimGuestPushDelivery: repository.claim,
  claimedGuestPushDeliveryExpiry: repository.claimExpired,
}));
vi.mock("../src/modules/guest-push/guest-push-eligibility-repository", () => ({
  resolveEligibleGuestPushDelivery: repository.eligible,
}));
vi.mock("../src/modules/guest-push/guest-push-finalization-repository", () => ({
  finalizeGuestPushDelivery: repository.finalize,
  finalizeGuestPushInvalidEndpoint: repository.invalidEndpoint,
  retryOrTerminalizeGuestPushDelivery: repository.retry,
}));

import { GuestPushDeliveryWorker } from "../src/modules/guest-push/guest-push-delivery-worker";
import {
  guestPushPolicyV1,
  type GuestPushOperationalPolicyShape,
} from "../src/modules/guest-push/guest-push-operational-policy";
import type {
  GuestPushProvider,
  GuestPushProviderSendResult,
} from "../src/modules/guest-push/guest-push-provider";

const claim = {
  attemptCount: 1,
  deliveryId: "11111111-1111-4111-8111-111111111111",
  leaseToken: "22222222-2222-4222-8222-222222222222",
  maxAttempts: 4,
  reclaimed: false,
} as const;

const eligible = {
  ...claim,
  auth: "auth-secret",
  endpoint: "https://fcm.googleapis.com/fcm/send/opaque",
  intentId: "33333333-3333-4333-8333-333333333333",
  locale: "en" as const,
  p256dh: "p256dh-key",
  registrationId: "44444444-4444-4444-8444-444444444444",
  remainingLifetimeMilliseconds: 30_000,
  remainingLeaseMilliseconds: 30_000,
};

const policy: GuestPushOperationalPolicyShape = {
  ...guestPushPolicyV1,
  sendingEnabled: true,
};

function observer() {
  return { observe: vi.fn() };
}

function provider(
  result: Awaited<ReturnType<GuestPushProvider["send"]>>,
): GuestPushProvider & { send: ReturnType<typeof vi.fn> } {
  return {
    send: vi.fn(async (request) => {
      request.messageForTransport();
      return result;
    }),
  };
}

describe("Guest Push delivery worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.claim.mockResolvedValue(claim);
    repository.eligible.mockResolvedValue(eligible);
    repository.finalize.mockResolvedValue(true);
    repository.invalidEndpoint.mockResolvedValue(true);
    repository.retry.mockResolvedValue("RETRY_WAIT");
    repository.claimExpired.mockResolvedValue({ intentExpired: false, leaseExpired: false });
  });

  it("claims with the 30 second lease and fenced claim identity", async () => {
    const transport = provider({
      kind: "PROVIDER_RESULT",
      result: { resultClass: "ACCEPTED" },
    });
    const worker = new GuestPushDeliveryWorker(
      {} as never,
      policy,
      transport,
      observer(),
    );

    await expect(worker.runOnce()).resolves.toBe(true);

    expect(repository.claim).toHaveBeenCalledWith(
      expect.anything(),
      guestPushPolicyV1.leaseDurationSeconds,
    );
    expect(repository.finalize).toHaveBeenCalledWith(
      expect.anything(),
      claim,
      "PROVIDER_ACCEPTED",
      "ACCEPTED",
    );
  });

  it("suppresses a claimed delivery when final authority is gone", async () => {
    repository.eligible.mockResolvedValue(undefined);
    const transport = provider({
      kind: "PROVIDER_RESULT",
      result: { resultClass: "ACCEPTED" },
    });
    const worker = new GuestPushDeliveryWorker(
      {} as never,
      policy,
      transport,
      observer(),
    );

    await worker.runOnce();

    expect(transport.send).not.toHaveBeenCalled();
    expect(repository.finalize).toHaveBeenCalledWith(
      expect.anything(),
      claim,
      "SUPPRESSED",
    );
  });

  it("does not suppress live work after the resolver detects an expired lease", async () => {
    repository.eligible.mockResolvedValue(undefined);
    repository.claimExpired.mockResolvedValue({
      intentExpired: false,
      leaseExpired: true,
    });
    const transport = provider({
      kind: "PROVIDER_RESULT",
      result: { resultClass: "ACCEPTED" },
    });
    const worker = new GuestPushDeliveryWorker(
      {} as never,
      policy,
      transport,
      observer(),
    );

    await expect(worker.runOnce()).resolves.toBe(true);
    expect(transport.send).not.toHaveBeenCalled();
    expect(repository.finalize).not.toHaveBeenCalled();
  });

  it("expires if the absolute READY lifetime ends before transport starts", async () => {
    let monotonicNow = 0;
    repository.eligible.mockResolvedValue({
      ...eligible,
      remainingLifetimeMilliseconds: 1_000,
    });
    const transport: GuestPushProvider = {
      send: vi.fn(
        async (request): Promise<GuestPushProviderSendResult> =>
          request.messageForTransport() === undefined
            ? { kind: "EXPIRED_BEFORE_TRANSPORT" }
            : {
                kind: "PROVIDER_RESULT",
                result: { resultClass: "ACCEPTED" },
              },
      ),
    };
    const worker = new GuestPushDeliveryWorker(
      {} as never,
      policy,
      transport,
      observer(),
      Math.random,
      () => monotonicNow,
      async () => undefined,
      async () => {
        monotonicNow = 1_000;
      },
    );

    await worker.runOnce();

    expect(repository.finalize).toHaveBeenCalledWith(
      expect.anything(),
      claim,
      "EXPIRED",
    );
  });

  it("does not start provider I/O after the lease becomes too short to finish safely", async () => {
    let monotonicNow = 0;
    repository.eligible.mockResolvedValue({
      ...eligible,
      remainingLeaseMilliseconds: 11_000,
    });
    const transport = provider({
      kind: "PROVIDER_RESULT",
      result: { resultClass: "ACCEPTED" },
    });
    const worker = new GuestPushDeliveryWorker(
      {} as never,
      policy,
      transport,
      observer(),
      Math.random,
      () => monotonicNow,
      async () => undefined,
      async () => { monotonicNow = 2_000; },
    );

    await expect(worker.runOnce()).resolves.toBe(true);
    expect(transport.send).not.toHaveBeenCalled();
    expect(repository.finalize).not.toHaveBeenCalled();
    expect(repository.retry).not.toHaveBeenCalled();
  });

  it("schedules bounded retry without changing the original intent lifetime", async () => {
    const transport = provider({
      kind: "PROVIDER_RESULT",
      result: { resultClass: "TRANSIENT" },
    });
    const worker = new GuestPushDeliveryWorker(
      {} as never,
      policy,
      transport,
      observer(),
      () => 0,
    );

    await worker.runOnce();

    expect(repository.retry).toHaveBeenCalledWith(
      expect.anything(),
      claim,
      "TRANSIENT",
      10,
    );
  });

  it("leaves the durable lease unresolved if the process dies after provider acceptance", async () => {
    const transport = provider({
      kind: "PROVIDER_RESULT",
      result: { resultClass: "ACCEPTED" },
    });
    const worker = new GuestPushDeliveryWorker(
      {} as never,
      policy,
      transport,
      observer(),
      Math.random,
      () => 0,
      async () => {
        throw new Error("simulated process death");
      },
    );

    await expect(worker.runOnce()).rejects.toThrow("simulated process death");
    expect(repository.finalize).not.toHaveBeenCalled();
  });
});
