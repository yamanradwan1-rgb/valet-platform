import { describe, expect, it } from "vitest";

import { buildWebPushPayload } from "../src/modules/web-push-delivery/web-push-payload";

describe("Web Push payload", () => {
  it.each(["en", "ar"] as const)(
    "builds a strict credential-free Employee payload in %s",
    (locale) => {
      const payload = buildWebPushPayload({
        locale,
        presentationType: "EMPLOYEE_RETRIEVAL_REQUESTED",
        taskId: "10000000-0000-4000-8000-000000000001",
      });
      expect(Object.keys(payload).sort()).toEqual([
        "audience",
        "body",
        "direction",
        "identity",
        "locale",
        "presentationType",
        "route",
        "title",
        "version",
      ]);
      expect(JSON.stringify(payload)).not.toMatch(
        /bearer|token|endpoint|p256dh|auth|plate|phone|pickup|handoff/i,
      );
    },
  );

  it("uses session plus ready_at as the stable Guest identity", () => {
    const payload = buildWebPushPayload({
      locale: "ar",
      presentationType: "GUEST_VEHICLE_READY",
      readyAt: "2026-08-30T00:00:00.000Z",
      valetSessionId: "20000000-0000-4000-8000-000000000002",
    });
    expect(payload.identity).toBe(
      "20000000-0000-4000-8000-000000000002:2026-08-30T00:00:00.000Z",
    );
    expect(payload).toMatchObject({
      audience: "GUEST",
      direction: "rtl",
      route: "GUEST_HOME",
      version: 1,
    });
  });
});
