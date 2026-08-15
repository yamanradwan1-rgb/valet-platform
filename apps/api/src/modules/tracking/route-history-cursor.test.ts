import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  decodeRouteHistoryCursor,
  encodeRouteHistoryCursor,
} from "./route-history-cursor";

describe("route history cursor", () => {
  it("round trips the persisted route key as opaque transport state", () => {
    const routeKey = {
      capturedAt: new Date("2026-08-15T10:00:00.123Z"),
      id: randomUUID(),
    };
    const encoded = encodeRouteHistoryCursor(routeKey);
    expect(encoded).not.toContain(routeKey.id);
    expect(decodeRouteHistoryCursor(encoded)).toEqual(routeKey);
  });

  it.each(["broken", "e30", Buffer.from(JSON.stringify({ id: randomUUID() })).toString("base64url")])(
    "rejects malformed state safely",
    (cursor) => expect(() => decodeRouteHistoryCursor(cursor)).toThrow("The request is invalid."),
  );
});
