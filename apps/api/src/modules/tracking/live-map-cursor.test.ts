import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { decodeLiveMapCursor, encodeLiveMapCursor } from "./live-map-cursor";

describe("live map cursor", () => {
  it("round trips the canonical tracker tuple", () => {
    const cursor = {
      id: randomUUID(),
      startedAt: new Date("2026-08-15T10:00:00.000Z"),
    };
    expect(decodeLiveMapCursor(encodeLiveMapCursor(cursor))).toEqual(cursor);
  });

  it.each(["broken", Buffer.from("{}").toString("base64url")])(
    "rejects malformed opaque cursor %s",
    (value) => expect(() => decodeLiveMapCursor(value)).toThrow(),
  );
});
