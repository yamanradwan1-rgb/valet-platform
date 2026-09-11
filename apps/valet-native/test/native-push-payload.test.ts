import { describe, expect, it } from "vitest";

import { parseNativePushWirePayload } from "../src/notifications/native-push-payload";
import { fakeIntentId, validWirePayload } from "./native-push-fixture";

describe("Native push wire normalization", () => {
  it("accepts exactly the string FCM wire contract and normalizes version", () => {
    expect(parseNativePushWirePayload(validWirePayload())).toEqual({
      intentId: fakeIntentId,
      kind: "EMPLOYEE_RETRIEVAL_REQUESTED",
      routeIntent: "TASK_QUEUE",
      schemaVersion: 1,
    });
  });

  it.each([
    { ...validWirePayload(), schemaVersion: 1 },
    { ...validWirePayload(), schemaVersion: "2" },
    { ...validWirePayload(), kind: "TASK_ASSIGNED" },
    { ...validWirePayload(), routeIntent: "TASK_DETAIL" },
    { ...validWirePayload(), intentId: "not-a-uuid" },
    { kind: "EMPLOYEE_RETRIEVAL_REQUESTED" },
    { ...validWirePayload(), taskId: fakeIntentId },
    { ...validWirePayload(), kind: { nested: true } },
    [validWirePayload()],
    null,
  ])("rejects malformed, unknown, or augmented wire data", (value) => {
    expect(parseNativePushWirePayload(value)).toBeNull();
  });
});
