import { describe, expect, it } from "vitest";
import { parseQrInput, DYNAMIC_QR_PATTERN } from "./qr-input";
import {
  parseResourceQr,
  RESOURCE_QR_PREFIXES,
  RESOURCE_QR_V2_MAX_LENGTH,
  RESOURCE_QR_V2_PREFIXES,
} from "./qr-resource-payload";

const resourceId = "11111111-2222-4333-8444-555555555555";

describe("shared Employee QR grammar", () => {
  it.each(["key-slot", "parking-spot"] as const)(
    "preserves %s resource codes byte-exact",
    (kind) => {
      for (const code of ["K-01", "A-03", "k-Ab_07.x", "K 9", " ك-١", "A:B"]) {
        expect(
          parseQrInput(`  ${RESOURCE_QR_PREFIXES[kind]}${code}\n`, kind),
        ).toEqual({
          ok: true,
          value: {
            kind,
            resourceCode: code,
            resourceId: null,
            version: "V1",
          },
        });
      }
    },
  );
  it.each(["key-slot", "parking-spot"] as const)(
    "preserves %s V2 immutable identity and exact code",
    (kind) => {
      const code = "k-Ab_07.x:A";
      expect(
        parseQrInput(
          `${RESOURCE_QR_V2_PREFIXES[kind]}${resourceId}:${code}`,
          kind,
        ),
      ).toEqual({
        ok: true,
        value: { kind, resourceCode: code, resourceId, version: "V2" },
      });
    },
  );
  it("enforces the derived V2 total length cap", () => {
    const prefix = RESOURCE_QR_V2_PREFIXES["parking-spot"];
    const code = "X".repeat(RESOURCE_QR_V2_MAX_LENGTH - prefix.length - 37);
    const text = `${prefix}${resourceId}:${code}`;
    expect(text).toHaveLength(RESOURCE_QR_V2_MAX_LENGTH);
    expect(parseQrInput(text, "parking-spot").ok).toBe(true);
    expect(parseQrInput(text + "X", "parking-spot")).toEqual({
      ok: false,
      reason: "too-long",
    });
  });
  it.each(["key-slot", "parking-spot"] as const)(
    "enforces the exact 120 total length for %s",
    (kind) => {
      const text = RESOURCE_QR_PREFIXES[kind].padEnd(120, "X");
      expect(parseQrInput(text, kind).ok).toBe(true);
      expect(parseQrInput(text + "X", kind)).toEqual({
        ok: false,
        reason: "too-long",
      });
    },
  );
  it.each([
    "",
    "   ",
    "vaylet:key-slot:",
    "vaylet:parking-spot:",
    "VAYLET:key-slot:K-01",
    "vaylet:Key-slot:K-01",
    "vaylet:key_slot:K-01",
    "https://example.invalid/?qr=vaylet:key-slot:K-01",
    '{"resourceCode":"K-01"}',
    "vaylet:task:K-01",
    "garbage",
    null,
    undefined,
    42,
  ])("rejects invalid resource input %s", (raw) => {
    expect(parseQrInput(raw, "key-slot").ok).toBe(false);
  });
  it("rejects either opposite resource type", () => {
    expect(parseResourceQr("vaylet:key-slot:K-01", "parking-spot")).toEqual({
      ok: false,
      reason: "wrong-type",
    });
    expect(parseResourceQr("vaylet:parking-spot:A-03", "key-slot")).toEqual({
      ok: false,
      reason: "wrong-type",
    });
    expect(
      parseResourceQr(
        `${RESOURCE_QR_V2_PREFIXES["key-slot"]}${resourceId}:K-01`,
        "parking-spot",
      ),
    ).toEqual({ ok: false, reason: "wrong-type" });
  });
  it("rejects malformed V2 resource identity", () => {
    expect(
      parseResourceQr("vaylet:v2:key-slot:not-a-uuid:K-01", "key-slot"),
    ).toEqual({ ok: false, reason: "unrecognized" });
  });
  const dummy = `vhq1.${"aB0_-".repeat(9).slice(0, 43)}`;
  it("returns the exact canonical raw Dynamic QR without transformation", () => {
    expect(DYNAMIC_QR_PATTERN.test(dummy)).toBe(true);
    const result = parseQrInput(dummy, "dynamic-handoff");
    expect(result).toEqual({
      ok: true,
      value: { kind: "dynamic-handoff", proof: dummy },
    });
    if (result.ok && result.value.kind === "dynamic-handoff") {
      expect(result.value.proof).toBe(dummy);
    }
  });
  it.each([
    ` ${dummy}`,
    `${dummy} `,
    `\n${dummy}`,
    `${dummy}\n`,
    `\t${dummy}\t`,
    "VHQ1." + "A".repeat(43),
    "vhq2." + "A".repeat(43),
    "vhq1." + "A".repeat(42),
    "vhq1." + "A".repeat(44),
    "vhq1." + "A".repeat(42) + "+",
    dummy + "=",
    dummy + ".",
    `https://example.invalid/${dummy}`,
    JSON.stringify({ proof: dummy }),
    "vaylet:key-slot:K-01",
    "",
    null,
  ])("rejects noncanonical Dynamic input %s", (raw) => {
    expect(parseQrInput(raw, "dynamic-handoff").ok).toBe(false);
  });
  it("does not interpret resource codes as embedded authority", () => {
    expect(
      parseQrInput("vaylet:key-slot:organizationId=other", "key-slot"),
    ).toEqual({
      ok: true,
      value: {
        kind: "key-slot",
        resourceCode: "organizationId=other",
        resourceId: null,
        version: "V1",
      },
    });
  });
});
