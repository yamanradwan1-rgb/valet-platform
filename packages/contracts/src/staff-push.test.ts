import { describe, expect, it } from "vitest";

import {
  staffPushDeliveryStateSchema,
  staffPushPayloadSchema,
  staffPushPlatformSchema,
  staffPushProviderResultClassSchema,
  staffPushProviderSchema,
  staffPushRegistrationRequestSchema,
  staffPushRegistrationResponseSchema,
  staffPushRegistrationStateSchema,
} from "./staff-push";
import { staffPushPayloadSchema as barrelPayloadSchema } from "./index";

const intentId = "00000000-0000-4000-8000-000000000001";

describe("Staff push public contracts", () => {
  it("exports the safe attention payload through the package barrel", () => {
    expect(barrelPayloadSchema).toBe(staffPushPayloadSchema);
  });

  it("locks the provider-neutral infrastructure values", () => {
    expect(staffPushProviderSchema.options).toEqual(["FCM", "APNS"]);
    expect(staffPushPlatformSchema.options).toEqual(["ANDROID", "IOS"]);
  });

  it("locks the accepted registration and delivery states", () => {
    expect(staffPushRegistrationStateSchema.options).toEqual([
      "ACTIVE",
      "DISABLED",
      "PROVIDER_INVALID",
      "SUPERSEDED",
    ]);
    expect(staffPushDeliveryStateSchema.options).toEqual([
      "PENDING",
      "LEASED",
      "RETRY_WAIT",
      "PROVIDER_ACCEPTED",
      "SUPPRESSED",
      "PERMANENT_FAILURE",
      "EXPIRED",
    ]);
  });

  it("locks every normalized provider-result class", () => {
    expect(staffPushProviderResultClassSchema.options).toEqual([
      "ACCEPTED",
      "TRANSIENT",
      "RATE_LIMITED",
      "INVALID_ENDPOINT",
      "PERMANENT",
      "CONFIGURATION",
      "UNKNOWN",
    ]);
  });

  it("accepts only the privacy-safe attention payload", () => {
    const payload = {
      schemaVersion: 1,
      kind: "EMPLOYEE_RETRIEVAL_REQUESTED",
      intentId,
      routeIntent: "TASK_QUEUE",
    } as const;
    expect(staffPushPayloadSchema.parse(payload)).toEqual(payload);

    for (const privateField of [
      "organizationId",
      "locationId",
      "taskId",
      "providerToken",
    ]) {
      expect(
        staffPushPayloadSchema.safeParse({
          ...payload,
          [privateField]: "must-not-be-public",
        }).success,
      ).toBe(false);
    }
  });

  it("rejects unknown versions, kinds, routes, and non-UUID intent IDs", () => {
    expect(
      staffPushPayloadSchema.safeParse({
        schemaVersion: 2,
        kind: "EMPLOYEE_RETRIEVAL_REQUESTED",
        intentId,
        routeIntent: "TASK_QUEUE",
      }).success,
    ).toBe(false);
    expect(
      staffPushPayloadSchema.safeParse({
        schemaVersion: 1,
        kind: "TASK_ASSIGNED",
        intentId: "not-an-id",
        routeIntent: "TASK_DETAIL",
      }).success,
    ).toBe(false);
  });
});

describe("Staff push registration contracts", () => {
  const request = {
    appBuild: "100",
    appIdentifier: "com.vaylet.employee",
    appVersion: "1.0.0",
    installationId: "00000000-0000-4000-8000-000000000002",
    locale: "en",
    platform: "ANDROID",
    provider: "FCM",
    providerToken: "synthetic-provider-token",
  } as const;

  it("accepts the initial Android/FCM application and both locales", () => {
    expect(staffPushRegistrationRequestSchema.parse(request)).toEqual(request);
    expect(
      staffPushRegistrationRequestSchema.parse({ ...request, locale: "ar" }),
    ).toMatchObject({ locale: "ar" });
  });

  it.each([
    ["APNS", "ANDROID", "com.vaylet.employee"],
    ["FCM", "IOS", "com.vaylet.employee"],
    ["FCM", "ANDROID", "com.example.employee"],
  ])(
    "rejects unsupported provider/platform/application input",
    (provider, platform, appIdentifier) => {
      expect(
        staffPushRegistrationRequestSchema.safeParse({
          ...request,
          appIdentifier,
          platform,
          provider,
        }).success,
      ).toBe(false);
    },
  );

  it("requires bounded opaque token and build metadata plus a UUID installation", () => {
    for (const candidate of [
      { ...request, providerToken: "" },
      { ...request, providerToken: " ".repeat(10) },
      { ...request, providerToken: "x".repeat(4097) },
      { ...request, appVersion: "x".repeat(65) },
      { ...request, appBuild: "x".repeat(65) },
      { ...request, installationId: "not-a-uuid" },
    ]) {
      expect(
        staffPushRegistrationRequestSchema.safeParse(candidate).success,
      ).toBe(false);
    }
  });

  it.each([
    "userId",
    "sessionId",
    "staffAuthSessionId",
    "organizationId",
    "locationId",
    "membershipId",
    "recipientMembershipId",
    "role",
    "shiftId",
    "taskId",
    "state",
    "tokenHash",
    "registrationId",
    "terminalAt",
    "terminalReasonClass",
    "supersededByRegistrationId",
  ])("rejects unknown or authority field %s", (field) => {
    expect(
      staffPushRegistrationRequestSchema.safeParse({
        ...request,
        [field]: "spoofed",
      }).success,
    ).toBe(false);
  });

  it("keeps the response strict and free of token/session authority", () => {
    const response = staffPushRegistrationResponseSchema.parse({
      appBuild: request.appBuild,
      appIdentifier: request.appIdentifier,
      appVersion: request.appVersion,
      installationId: request.installationId,
      lastConfirmedAt: "2026-09-11T12:00:00.000Z",
      locale: request.locale,
      platform: request.platform,
      provider: request.provider,
      registrationId: "00000000-0000-4000-8000-000000000003",
      state: "ACTIVE",
    });
    expect(response).not.toHaveProperty("providerToken");
    expect(response).not.toHaveProperty("tokenHash");
    expect(response).not.toHaveProperty("staffAuthSessionId");
    expect(
      staffPushRegistrationResponseSchema.safeParse({
        ...response,
        providerToken: "synthetic-provider-token",
      }).success,
    ).toBe(false);
  });
});
