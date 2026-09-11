import { afterEach, describe, expect, it, vi } from "vitest";
import type { NativeAuthSession } from "@valet/employee-client";

import { NativePushHttpRegistrationTransport } from "../src/notifications/native-push-registration-transport";

const accessToken = `vsa1.${"a".repeat(43)}`;
const installationId = "11111111-1111-4111-8111-111111111111";
const registrationId = "22222222-2222-4222-8222-222222222222";
const request = {
  appBuild: "246",
  appIdentifier: "com.vaylet.employee" as const,
  appVersion: "2.4.6",
  installationId,
  locale: "ar" as const,
  platform: "ANDROID" as const,
  provider: "FCM" as const,
  providerToken: "synthetic-native-fcm-token",
};

function auth() {
  return {
    current: vi.fn(() => ({ authGeneration: 7, phase: "authenticated" })),
    getAccessToken: vi.fn(() => accessToken),
    handleDefinitiveAuthorizationLoss: vi.fn(async () => undefined),
    refresh: vi.fn(async () => "refreshed" as const),
  } as unknown as NativeAuthSession;
}

function response() {
  return {
    ...request,
    lastConfirmedAt: "2026-09-11T10:00:00.000Z",
    registrationId,
    state: "ACTIVE",
    providerToken: undefined,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Native push registration transport", () => {
  it("uses the existing bearer client and exact desired-state endpoint", async () => {
    vi.stubGlobal("__DEV__", false);
    const fetchMock = vi.fn(async () => Response.json(response()));
    vi.stubGlobal("fetch", fetchMock);

    await new NativePushHttpRegistrationTransport(
      "https://api.example.com",
      auth(),
    ).reconcile(request);

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "https://api.example.com/v1/staff/push/registrations",
      expect.objectContaining({
        body: JSON.stringify(request),
        headers: expect.objectContaining({
          Authorization: `Bearer ${accessToken}`,
        }),
        method: "PUT",
      }),
    );
    expect(Object.keys(request).sort()).toEqual([
      "appBuild",
      "appIdentifier",
      "appVersion",
      "installationId",
      "locale",
      "platform",
      "provider",
      "providerToken",
    ]);
  });

  it("rejects a malformed response through the strict shared contract", async () => {
    vi.stubGlobal("__DEV__", false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ state: "ACTIVE" })),
    );

    await expect(
      new NativePushHttpRegistrationTransport(
        "https://api.example.com",
        auth(),
      ).reconcile(request),
    ).rejects.toMatchObject({ code: "NATIVE_PUSH_RESPONSE_INVALID" });
  });
});
