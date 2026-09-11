import { describe, expect, it } from "vitest";

import {
  buildRetrievalAttentionMessage,
  isValidRetrievalAttentionMessage,
} from "../src/modules/staff-push/staff-push-payload";

describe("Staff Push payload", () => {
  it.each([
    ["en", "New retrieval task available"],
    ["ar", "مهمة استرجاع جديدة متاحة"],
  ])("builds the exact safe %s message", (locale, body) => {
    const message = buildRetrievalAttentionMessage({
      intentId: "00000000-0000-4000-8000-000000000001",
      locale,
      providerToken: "destination-only",
      remainingLifetimeMilliseconds: 12_345,
    });
    expect(message).toEqual({
      android: { priority: "HIGH", ttl: "12.345s" },
      data: {
        intentId: "00000000-0000-4000-8000-000000000001",
        kind: "EMPLOYEE_RETRIEVAL_REQUESTED",
        routeIntent: "TASK_QUEUE",
        schemaVersion: "1",
      },
      notification: { body, title: "VAYLET" },
      token: "destination-only",
    });
    expect(isValidRetrievalAttentionMessage(message)).toBe(true);
    expect(Object.keys(message!.data).sort()).toEqual([
      "intentId",
      "kind",
      "routeIntent",
      "schemaVersion",
    ]);
    expect(JSON.stringify(message!.data)).not.toMatch(
      /user|membership|session|organization|location|taskId|vehicle|plate|phone|key|gps|payment|token/i,
    );
  });

  it("falls back to English and refuses nonpositive remaining TTL", () => {
    expect(
      buildRetrievalAttentionMessage({
        intentId: "safe-id",
        locale: "unexpected",
        providerToken: "destination-only",
        remainingLifetimeMilliseconds: 1_000,
      })?.notification.body,
    ).toBe("New retrieval task available");
    expect(
      buildRetrievalAttentionMessage({
        intentId: "safe-id",
        locale: "en",
        providerToken: "destination-only",
        remainingLifetimeMilliseconds: 0,
      }),
    ).toBeUndefined();
  });
});
