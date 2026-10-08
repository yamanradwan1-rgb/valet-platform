import { describe, expect, it, vi } from "vitest";

import { mapApiError } from "../src/common/http/api-errors";
import { readGuestPushPublicConfig } from "../src/modules/guest-push-registration/guest-push-public-config";
import {
  GuestPushRegistrationUnavailableError,
  parseGuestPushRegistrationRequest,
} from "../src/modules/guest-push-registration/guest-push-registration-types";
import { GuestPushRegistrationService } from "../src/modules/guest-push-registration/guest-push-registration.service";

const publicKey = "A".repeat(87);
const p256dh = "B".repeat(87);
const auth = "C".repeat(22);
const endpoint = "https://fcm.googleapis.com/fcm/send/opaque-subscription";
const reservation = {
  key: { scope: "GUEST_UNKNOWN_CREDENTIAL", value: "safe" },
  id: "11111111-1111-4111-8111-111111111111",
} as never;

describe("Guest Push public registration contract", () => {
  it("uses only registration rollout state and the public VAPID key", () => {
    expect(readGuestPushPublicConfig({})).toEqual({ enabled: false, publicKey: null });
    expect(readGuestPushPublicConfig({
      GUEST_PUSH_REGISTRATION_ENABLED: "false",
      GUEST_PUSH_VAPID_PUBLIC_KEY: publicKey,
    })).toEqual({ enabled: false, publicKey: null });
    expect(readGuestPushPublicConfig({
      GUEST_PUSH_REGISTRATION_ENABLED: "true",
      GUEST_PUSH_VAPID_PUBLIC_KEY: publicKey,
    })).toEqual({ enabled: true, publicKey });
    expect(readGuestPushPublicConfig({
      GUEST_PUSH_REGISTRATION_ENABLED: "true",
      GUEST_PUSH_VAPID_PUBLIC_KEY: "invalid key",
    })).toEqual({ enabled: false, publicKey: null });
  });

  it("accepts only the flat allowlisted Web Push subscription shape", () => {
    expect(parseGuestPushRegistrationRequest({ endpoint, p256dh, auth, locale: "en" }))
      .toEqual({ endpoint, p256dh, auth, locale: "en" });
    expect(parseGuestPushRegistrationRequest({
      endpoint: "https://api.push.apple.com/3/device/opaque",
      p256dh,
      auth,
      locale: "ar",
    })).toMatchObject({ locale: "ar" });
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/x",
    "https://user@fcm.googleapis.com/fcm/send/x",
    "https://fcm.googleapis.com:8443/fcm/send/x",
    "https://fcm.googleapis.com/#secret",
    "https://fcm.googleapis.com",
    "https://fcm.googleapis.com.evil.test/fcm/send/x",
    "https://push.example.test/subscription",
  ])("rejects unsafe push endpoint %s", (unsafeEndpoint) => {
    expect(() => parseGuestPushRegistrationRequest({
      endpoint: unsafeEndpoint,
      p256dh,
      auth,
      locale: "en",
    })).toThrow();
  });

  it("maps disabled rollout to a controlled 503", () => {
    expect(mapApiError(new GuestPushRegistrationUnavailableError(), true)).toMatchObject({
      code: "GUEST_PUSH_REGISTRATION_UNAVAILABLE",
      status: 503,
    });
  });

  it("does not call the registration SQL when rollout config is disabled", async () => {
    const query = vi.fn(async (sql: string) => ({
      rows: sql === "BEGIN" || sql === "COMMIT" ? [] : [],
      rowCount: 0,
    }));
    const client = { query, release: vi.fn() };
    const pool = { connect: vi.fn(async () => client) } as never;
    const antiAbuse = {
      finalizeInTransaction: vi.fn(async () => undefined),
    } as never;
    const service = new GuestPushRegistrationService(pool, antiAbuse, {} as never);
    const previousFlag = process.env.GUEST_PUSH_REGISTRATION_ENABLED;
    const previousKey = process.env.GUEST_PUSH_VAPID_PUBLIC_KEY;
    process.env.GUEST_PUSH_REGISTRATION_ENABLED = "false";
    process.env.GUEST_PUSH_VAPID_PUBLIC_KEY = publicKey;
    try {
      await expect(service.register(
        reservation,
        { kind: "BROWSER_SESSION", secret: `vgb1.${"D".repeat(43)}` },
        { endpoint, p256dh, auth, locale: "en" },
      )).rejects.toBeInstanceOf(GuestPushRegistrationUnavailableError);
      expect(query.mock.calls.some(([sql]) => String(sql).includes("guest_push_register_v1")))
        .toBe(false);
    } finally {
      if (previousFlag === undefined) delete process.env.GUEST_PUSH_REGISTRATION_ENABLED;
      else process.env.GUEST_PUSH_REGISTRATION_ENABLED = previousFlag;
      if (previousKey === undefined) delete process.env.GUEST_PUSH_VAPID_PUBLIC_KEY;
      else process.env.GUEST_PUSH_VAPID_PUBLIC_KEY = previousKey;
    }
  });

  it("commits counted invalid authority before throwing and stores no subscription", async () => {
    const query = vi.fn(async (sql: string) => {
      void sql;
      return { rows: [], rowCount: 0 };
    });
    const client = { query, release: vi.fn() };
    const pool = { connect: vi.fn(async () => client) } as never;
    const antiAbuse = {
      finalizeInTransaction: vi.fn(async () => undefined),
    };
    const service = new GuestPushRegistrationService(
      pool,
      antiAbuse as never,
      {} as never,
    );

    await expect(service.register(
      reservation,
      { kind: "LEGACY_BEARER", secret: "E".repeat(43) },
      { endpoint, p256dh, auth, locale: "en" },
    )).rejects.toMatchObject({ code: "GUEST_ACCESS_INVALID" });

    expect(antiAbuse.finalizeInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      reservation,
      "COUNTED",
    );
    expect(query.mock.calls.map(([sql]) => String(sql))).toContain("COMMIT");
    expect(query.mock.calls.map(([sql]) => String(sql))).not.toContain("ROLLBACK");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("guest_push_register_v1")))
      .toBe(false);
  });
});
