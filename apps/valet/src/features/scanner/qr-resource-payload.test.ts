import { describe, expect, it } from "vitest";

import {
  hasKnownResourcePrefix,
  parseResourceQr,
  RESOURCE_QR_MAX_LENGTH,
  RESOURCE_QR_V2_MAX_LENGTH,
  RESOURCE_QR_V2_PREFIXES,
} from "./qr-resource-payload";

const resourceId = "11111111-2222-4333-8444-555555555555";

describe("DEC-067 resource QR payload parser", () => {
  it("accepts a key-slot payload and preserves the code byte-exact", () => {
    const result = parseResourceQr("vaylet:key-slot:B-214", "key-slot");
    expect(result).toEqual({
      ok: true,
      payload: {
        kind: "key-slot",
        resourceCode: "B-214",
        resourceId: null,
        version: "V1",
      },
    });
  });

  it("accepts a parking-spot payload", () => {
    const result = parseResourceQr(
      "vaylet:parking-spot:P-101",
      "parking-spot",
    );
    expect(result).toEqual({
      ok: true,
      payload: {
        kind: "parking-spot",
        resourceCode: "P-101",
        resourceId: null,
        version: "V1",
      },
    });
  });

  it("accepts V2 and preserves immutable identity and code", () => {
    expect(
      parseResourceQr(
        `${RESOURCE_QR_V2_PREFIXES["key-slot"]}${resourceId}:k:A-1`,
        "key-slot",
      ),
    ).toEqual({
      ok: true,
      payload: {
        kind: "key-slot",
        resourceCode: "k:A-1",
        resourceId,
        version: "V2",
      },
    });
  });

  it("never case-folds or normalizes the resource code", () => {
    const result = parseResourceQr(
      "vaylet:key-slot:k-Ab_07.x",
      "key-slot",
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.resourceCode).toBe("k-Ab_07.x");
  });

  it("trims surrounding whitespace only (server/manual semantics)", () => {
    const result = parseResourceQr(
      "  vaylet:key-slot:K 9\n",
      "key-slot",
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.resourceCode).toBe("K 9");
  });

  it("rejects empty payloads", () => {
    expect(parseResourceQr("", "key-slot")).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(parseResourceQr("   ", "parking-spot")).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("rejects a bare prefix with no resource code", () => {
    expect(parseResourceQr("vaylet:key-slot:", "key-slot")).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("rejects a known prefix of the wrong type in a friendly way", () => {
    expect(parseResourceQr("vaylet:key-slot:K-1", "parking-spot")).toEqual({
      ok: false,
      reason: "wrong-type",
    });
    expect(parseResourceQr("vaylet:parking-spot:A-1", "key-slot")).toEqual({
      ok: false,
      reason: "wrong-type",
    });
  });

  it("rejects URLs, JSON and garbage as unrecognized", () => {
    expect(parseResourceQr("https://vaylet.example/key/1", "key-slot")).toEqual({
      ok: false,
      reason: "unrecognized",
    });
    expect(parseResourceQr('{"resourceCode":"A-1"}', "key-slot")).toEqual({
      ok: false,
      reason: "unrecognized",
    });
    expect(parseResourceQr("vhq1.abc123", "key-slot")).toEqual({
      ok: false,
      reason: "unrecognized",
    });
    expect(parseResourceQr("garbage!!", "parking-spot")).toEqual({
      ok: false,
      reason: "unrecognized",
    });
    expect(parseResourceQr("vaylet:task:1", "key-slot")).toEqual({
      ok: false,
      reason: "unrecognized",
    });
  });

  it("rejects overlong payloads at the locked cap", () => {
    const longCode = "A".repeat(RESOURCE_QR_MAX_LENGTH);
    const tooLongCode = "A".repeat(RESOURCE_QR_MAX_LENGTH + 1);
    expect(
      parseResourceQr(`vaylet:key-slot:${tooLongCode}`, "key-slot"),
    ).toEqual({ ok: false, reason: "too-long" });
    const boundary = parseResourceQr(
      `vaylet:key-slot:${longCode.slice(0, longCode.length - "vaylet:key-slot:".length)}`,
      "key-slot",
    );
    expect(boundary.ok).toBe(true);
  });

  it("rejects overlong V2 payloads at the derived cap", () => {
    const prefix = RESOURCE_QR_V2_PREFIXES["parking-spot"];
    const code = "A".repeat(RESOURCE_QR_V2_MAX_LENGTH - prefix.length - 37);
    expect(
      parseResourceQr(`${prefix}${resourceId}:${code}`, "parking-spot").ok,
    ).toBe(true);
    expect(
      parseResourceQr(`${prefix}${resourceId}:${code}X`, "parking-spot"),
    ).toEqual({ ok: false, reason: "too-long" });
  });

  it("rejects non-string input defensively", () => {
    expect(parseResourceQr(null, "key-slot")).toEqual({
      ok: false,
      reason: "unrecognized",
    });
  });

  it("reports which payloads carry any known VAYLET resource prefix", () => {
    expect(hasKnownResourcePrefix("vaylet:key-slot:X")).toBe(true);
    expect(hasKnownResourcePrefix("vaylet:parking-spot:Y")).toBe(true);
    expect(hasKnownResourcePrefix(`vaylet:v2:key-slot:${resourceId}:X`)).toBe(true);
    expect(hasKnownResourcePrefix("vhq1.abc")).toBe(false);
  });
});
