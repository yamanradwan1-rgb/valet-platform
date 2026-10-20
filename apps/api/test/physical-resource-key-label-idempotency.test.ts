import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createKeySlotRequestSchema } from "@valet/contracts";
import { keySlotCreateFingerprint } from "../src/modules/dashboard/physical-resource-policy";

const locationId = "00000000-0000-4000-8000-000000000001";
const operationId = "00000000-0000-4000-8000-000000000002";
const base = { operationId, code: "K-01" };

describe("Issue #304 Key Slot create idempotency fingerprint", () => {
  it("preserves byte-identical legacy hash when no label is provided", () => {
    const expected = createHash("sha256")
      .update(JSON.stringify({ kind: "KEY_SLOT", locationId, code: "K-01" }))
      .digest("hex");
    const request = createKeySlotRequestSchema.parse(base);
    expect(keySlotCreateFingerprint(locationId, request)).toBe(expected);
  });

  it("changes when the same operation and code have different labels", () => {
    const first = createKeySlotRequestSchema.parse({
      ...base,
      label: "Front desk",
    });
    const second = createKeySlotRequestSchema.parse({
      ...base,
      label: "Back desk",
    });
    expect(keySlotCreateFingerprint(locationId, first)).not.toBe(
      keySlotCreateFingerprint(locationId, second),
    );
    expect(keySlotCreateFingerprint(locationId, first)).not.toBe(
      keySlotCreateFingerprint(
        locationId,
        createKeySlotRequestSchema.parse(base),
      ),
    );
  });

  it("normalizes boundary whitespace for an identical-label retry", () => {
    const first = createKeySlotRequestSchema.parse({
      ...base,
      label: "  Front desk  ",
    });
    const retry = createKeySlotRequestSchema.parse({
      ...base,
      label: "Front desk",
    });
    expect(keySlotCreateFingerprint(locationId, first)).toBe(
      keySlotCreateFingerprint(locationId, retry),
    );
  });
});
