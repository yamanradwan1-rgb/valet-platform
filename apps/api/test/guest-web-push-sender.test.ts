import { beforeEach, describe, expect, it, vi } from "vitest";

const webPushMocks = vi.hoisted(() => ({
  generateRequestDetails: vi.fn(),
}));

vi.mock("web-push", () => ({
  generateRequestDetails: webPushMocks.generateRequestDetails,
}));

import { remainingGuestPushLifetime } from "../src/modules/guest-push/guest-push-lifetime";
import {
  guestPushPolicyV1,
  readGuestPushOperationalPolicy,
} from "../src/modules/guest-push/guest-push-operational-policy";
import { guestPushRetryDelaySeconds } from "../src/modules/guest-push/guest-push-retry";
import {
  GuestWebPushAdapter,
  classifyGuestWebPushStatus,
  guestWebPushEndpointAllowed,
} from "../src/modules/guest-push/guest-web-push-adapter";
import { readGuestWebPushConfig } from "../src/modules/guest-push/guest-web-push-config";

const policyEnv: NodeJS.ProcessEnv = {
  GUEST_PUSH_WORKER_SENDING_ENABLED: "true",
  GUEST_PUSH_POLICY_VERSION: "1",
  GUEST_PUSH_INTENT_TTL_SECONDS: "1800",
  GUEST_PUSH_MAX_ATTEMPTS: "4",
  GUEST_PUSH_PROVIDER_CALL_TIMEOUT_SECONDS: "10",
  GUEST_PUSH_LEASE_DURATION_SECONDS: "30",
  GUEST_PUSH_RETRY_MINIMUM_SECONDS: "10",
  GUEST_PUSH_RETRY_CAP_SECONDS: "60",
  GUEST_PUSH_INTENT_DELIVERY_RETENTION_DAYS: "7",
  GUEST_PUSH_TERMINAL_REGISTRATION_RETENTION_DAYS: "30",
};

const webPushConfig = {
  privateKey: "p".repeat(43),
  publicKey: "P".repeat(87),
  subject: "mailto:push@example.com",
  timeoutMilliseconds: 10_000,
} as const;

function request(endpoint = "https://fcm.googleapis.com/fcm/send/opaque") {
  return {
    messageForTransport: () => ({
      auth: "auth-secret",
      endpoint,
      intentId: "11111111-1111-4111-8111-111111111111",
      locale: "ar" as const,
      p256dh: "p256dh-key",
      ttlSeconds: 1_234,
    }),
  };
}

function prepared(endpoint = "https://fcm.googleapis.com/fcm/send/opaque") {
  return {
    body: Buffer.from("encrypted"),
    endpoint,
    headers: { "content-type": "application/octet-stream" },
    method: "POST" as const,
  };
}

describe("Guest Web Push sender contracts", () => {
  beforeEach(() => {
    vi.useRealTimers();
    webPushMocks.generateRequestDetails.mockReset();
  });

  it("accepts only the approved Chrome and Apple push-service hosts", () => {
    expect(
      guestWebPushEndpointAllowed(
        "https://fcm.googleapis.com/fcm/send/opaque-subscription",
      ),
    ).toBe(true);
    expect(
      guestWebPushEndpointAllowed(
        "https://web.push.apple.com/opaque-subscription",
      ),
    ).toBe(true);
    expect(
      guestWebPushEndpointAllowed(
        "https://api.push.apple.com/opaque-subscription",
      ),
    ).toBe(true);

    for (const endpoint of [
      "http://fcm.googleapis.com/fcm/send/x",
      "https://localhost/push/x",
      "https://127.0.0.1/push/x",
      "https://fcm.googleapis.com.evil.test/push/x",
      "https://web.push.apple.com.evil.test/push/x",
      "https://push.apple.com/x",
      "https://user@fcm.googleapis.com/fcm/send/x",
      "https://fcm.googleapis.com:8443/fcm/send/x",
      "https://fcm.googleapis.com/",
    ]) {
      expect(guestWebPushEndpointAllowed(endpoint), endpoint).toBe(false);
    }
  });

  it("rejects a hostile stored endpoint before any outbound provider call", async () => {
    const providerRequest = vi.fn();
    const adapter = new GuestWebPushAdapter(
      webPushConfig,
      Date.now,
      providerRequest as never,
    );
    await expect(
      adapter.send(request("https://169.254.169.254/latest/meta-data")),
    ).resolves.toEqual({
      kind: "PROVIDER_RESULT",
      result: { resultClass: "INVALID_ENDPOINT" },
    });
    expect(webPushMocks.generateRequestDetails).not.toHaveBeenCalled();
    expect(providerRequest).not.toHaveBeenCalled();
  });

  it("sends only the bounded encrypted READY payload and absolute remaining TTL", async () => {
    webPushMocks.generateRequestDetails.mockReturnValue(prepared());
    const providerRequest = vi.fn().mockResolvedValue(
      new Response("", { status: 201 }),
    );
    const adapter = new GuestWebPushAdapter(
      webPushConfig,
      Date.now,
      providerRequest as never,
    );
    await expect(adapter.send(request())).resolves.toEqual({
      kind: "PROVIDER_RESULT",
      result: { resultClass: "ACCEPTED" },
    });
    expect(webPushMocks.generateRequestDetails).toHaveBeenCalledTimes(1);
    const [subscription, payload, options] =
      webPushMocks.generateRequestDetails.mock.calls[0]!;
    expect(subscription).toEqual({
      endpoint: "https://fcm.googleapis.com/fcm/send/opaque",
      keys: { auth: "auth-secret", p256dh: "p256dh-key" },
    });
    expect(JSON.parse(payload)).toEqual({
      schemaVersion: 1,
      kind: "GUEST_VEHICLE_READY",
      intentId: "11111111-1111-4111-8111-111111111111",
      routeIntent: "GUEST_STATUS",
      locale: "ar",
    });
    expect(options).toMatchObject({
      TTL: 1_234,
      contentEncoding: "aes128gcm",
      urgency: "high",
      vapidDetails: {
        privateKey: webPushConfig.privateKey,
        publicKey: webPushConfig.publicKey,
        subject: webPushConfig.subject,
      },
    });
    expect(options).not.toHaveProperty("proxy");
    expect(providerRequest).toHaveBeenCalledWith(
      "https://fcm.googleapis.com/fcm/send/opaque",
      expect.objectContaining({
        body: Buffer.from("encrypted"),
        credentials: "omit",
        method: "POST",
        redirect: "error",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("aborts at the 10 second absolute deadline without claiming acceptance", async () => {
    vi.useFakeTimers();
    webPushMocks.generateRequestDetails.mockReturnValue(prepared());
    const providerRequest = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          );
        }),
    );
    const adapter = new GuestWebPushAdapter(
      webPushConfig,
      Date.now,
      providerRequest as never,
    );
    const pending = adapter.send(request());
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toEqual({
      kind: "PROVIDER_RESULT",
      result: { resultClass: "UNKNOWN" },
    });
    const signal = providerRequest.mock.calls[0]?.[1].signal;
    expect(signal?.aborted).toBe(true);
  });

  it("uses strict bounded provider result classes", () => {
    expect(classifyGuestWebPushStatus(201)).toBe("ACCEPTED");
    expect(classifyGuestWebPushStatus(404)).toBe("INVALID_ENDPOINT");
    expect(classifyGuestWebPushStatus(410)).toBe("INVALID_ENDPOINT");
    expect(classifyGuestWebPushStatus(429)).toBe("RATE_LIMITED");
    expect(classifyGuestWebPushStatus(401)).toBe("CONFIGURATION");
    expect(classifyGuestWebPushStatus(503)).toBe("TRANSIENT");
    expect(classifyGuestWebPushStatus(413)).toBe("PERMANENT");
    expect(classifyGuestWebPushStatus(302)).toBe("UNKNOWN");
  });

  it("loads only the accepted immutable v1 policy values", () => {
    expect(readGuestPushOperationalPolicy(policyEnv)).toEqual({
      ...guestPushPolicyV1,
      sendingEnabled: true,
    });
    expect(() =>
      readGuestPushOperationalPolicy({
        ...policyEnv,
        GUEST_PUSH_INTENT_TTL_SECONDS: "1801",
      }),
    ).toThrow(/GUEST_PUSH_INTENT_TTL_SECONDS/);
  });

  it("does not require VAPID secrets while sender delivery is disabled", () => {
    expect(readGuestWebPushConfig({}, false, 10)).toBeUndefined();
    expect(
      readGuestWebPushConfig(
        {
          GUEST_PUSH_VAPID_SUBJECT: "mailto:push@example.com",
          GUEST_PUSH_VAPID_PUBLIC_KEY: "P".repeat(87),
          GUEST_PUSH_VAPID_PRIVATE_KEY: "p".repeat(43),
        },
        true,
        10,
      ),
    ).toEqual(webPushConfig);
  });

  it("keeps retries in the accepted 10..60 second envelope", () => {
    const policy = readGuestPushOperationalPolicy(policyEnv);
    expect(
      guestPushRetryDelaySeconds(
        1,
        { resultClass: "TRANSIENT" },
        policy,
        () => 0,
      ),
    ).toBe(10);
    expect(
      guestPushRetryDelaySeconds(
        4,
        { resultClass: "UNKNOWN" },
        policy,
        () => 0.999999,
      ),
    ).toBe(60);
    expect(
      guestPushRetryDelaySeconds(
        2,
        { resultClass: "RATE_LIMITED", retryAfterSeconds: 300 },
        policy,
        () => 0.5,
      ),
    ).toBe(60);
  });

  it("subtracts elapsed monotonic time from the DB-authored expiry", () => {
    expect(remainingGuestPushLifetime(30_000, 1_000, 2_500)).toBe(28_500);
    expect(remainingGuestPushLifetime(1_000, 1_000, 2_000)).toBeUndefined();
    expect(remainingGuestPushLifetime(10_000, 2_000, 1_000)).toBeUndefined();
  });
});
