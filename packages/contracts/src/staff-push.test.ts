import { describe, expect, it } from "vitest";

import {
  staffPushDeliveryStateSchema,
  staffPushPayloadSchema,
  staffPushPlatformSchema,
  staffPushProviderResultClassSchema,
  staffPushProviderSchema,
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
