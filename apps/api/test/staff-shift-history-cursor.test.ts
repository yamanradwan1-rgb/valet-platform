import { expect, it } from "vitest";
import { staffShiftHistoryQuerySchema } from "@valet/contracts";
import {
  decodeHistoryCursor,
  encodeHistoryCursor,
  historyFilterFingerprint,
} from "../src/modules/management/staff-shift-history-cursor";

const org = "60000000-0000-4000-8000-000000000001";
const scope = "a".repeat(64);
const filters = historyFilterFingerprint(
  staffShiftHistoryQuerySchema.parse({}),
);
const identity = {
  organizationId: org,
  scopeFingerprint: scope,
  fingerprint: filters,
  domain: "shift-history" as const,
};
const tuple = { startedAt: "2026-10-01T05:00:00.000Z", id: org };

it("round trips a dedicated versioned authority-bound history cursor", () => {
  const value = encodeHistoryCursor(identity, tuple);
  expect(value.length).toBeLessThanOrEqual(512);
  expect(decodeHistoryCursor(identity, value)).toEqual(tuple);
  expect(decodeHistoryCursor(identity, undefined)).toBeNull();
});
it("normalizes equivalent instants/UUIDs without exposing identity PII", () => {
  expect(
    historyFilterFingerprint(
      staffShiftHistoryQuerySchema.parse({ from: "2026-10-01T08:00:00+03:00" }),
    ),
  ).toBe(
    historyFilterFingerprint(
      staffShiftHistoryQuerySchema.parse({ from: tuple.startedAt }),
    ),
  );
  const decoded = Buffer.from(
    encodeHistoryCursor(identity, tuple),
    "base64url",
  ).toString();
  expect(decoded).not.toContain("email");
});
it("rejects organization, scope, filter, domain, version and tuple substitutions", () => {
  const value = encodeHistoryCursor(identity, tuple);
  for (const mismatch of [
    { ...identity, organizationId: "60000000-0000-4000-8000-000000000002" },
    { ...identity, scopeFingerprint: "b".repeat(64) },
    { ...identity, fingerprint: "c".repeat(64) },
    { ...identity, domain: "shift-employees" as const },
  ])
    expect(() => decodeHistoryCursor(mismatch, value)).toThrow(
      "The request is invalid.",
    );
  const original = JSON.parse(Buffer.from(value, "base64url").toString());
  for (const changes of [
    { v: 999 },
    { id: "bad" },
    { startedAt: "2026-10-01" },
    { extra: true },
  ]) {
    expect(() =>
      decodeHistoryCursor(
        identity,
        Buffer.from(JSON.stringify({ ...original, ...changes })).toString(
          "base64url",
        ),
      ),
    ).toThrow();
  }
  expect(() => decodeHistoryCursor(identity, "%%%")).toThrow();
});
