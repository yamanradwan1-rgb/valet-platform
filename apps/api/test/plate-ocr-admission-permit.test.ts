import { describe, expect, it, vi } from "vitest";
import {
  createOcrAdmissionPermit,
  OCR_PROOF_MAX_AGE_MS,
} from "../src/modules/check-in-api/plate-ocr-admission/plate-ocr-admission-permit";

describe("OCR admission private one-use fetch permit", () => {
  it("permits one synchronous fetch at a fresh proof and burns after use", () => {
    let now = 1_020;
    const permit = createOcrAdmissionPermit(
      { proofStartedAtMs: 1_000, remainingAuthorizedMs: 4_000 },
      () => now,
    );
    expect(permit.consumeIfFresh()).toBe(true);
    now = 1_021;
    expect(permit.consumeIfFresh()).toBe(false);
    expect(JSON.stringify(permit)).toBe("{}");
  });

  it("rejects exactly at the 250ms proof-age boundary", () => {
    expect(OCR_PROOF_MAX_AGE_MS).toBe(250);
    const fresh = createOcrAdmissionPermit(
      { proofStartedAtMs: 10, remainingAuthorizedMs: 10_000 },
      () => 259.999,
    );
    expect(fresh.consumeIfFresh()).toBe(true);
    const stale = createOcrAdmissionPermit(
      { proofStartedAtMs: 10, remainingAuthorizedMs: 10_000 },
      () => 260,
    );
    expect(stale.consumeIfFresh()).toBe(false);
  });

  it("honors a shorter DB-authoritative authorization window", () => {
    const justBefore = createOcrAdmissionPermit(
      { proofStartedAtMs: 100, remainingAuthorizedMs: 30 },
      () => 129.99,
    );
    const atExpiry = createOcrAdmissionPermit(
      { proofStartedAtMs: 100, remainingAuthorizedMs: 30 },
      () => 130,
    );
    expect(justBefore.consumeIfFresh()).toBe(true);
    expect(atExpiry.consumeIfFresh()).toBe(false);
  });

  it("burns on early clock or invalid age, without a later retry", () => {
    let now = 10;
    const permit = createOcrAdmissionPermit(
      { proofStartedAtMs: 100, remainingAuthorizedMs: 200 },
      () => now,
    );
    expect(permit.consumeIfFresh()).toBe(false);
    now = 101;
    expect(permit.consumeIfFresh()).toBe(false);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "fails closed for invalid DB remaining time %s",
    (remainingAuthorizedMs) => {
      const clock = vi.fn(() => 101);
      const permit = createOcrAdmissionPermit(
        { proofStartedAtMs: 100, remainingAuthorizedMs },
        clock,
      );
      expect(permit.consumeIfFresh()).toBe(false);
      expect(permit.consumeIfFresh()).toBe(false);
      expect(clock).toHaveBeenCalledTimes(1);
    },
  );

  it("burns when the clock throws instead of silently replaying", () => {
    const clock = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("clock unavailable");
      })
      .mockReturnValue(101);
    const permit = createOcrAdmissionPermit(
      { proofStartedAtMs: 100, remainingAuthorizedMs: 200 },
      clock,
    );
    expect(permit.consumeIfFresh()).toBe(false);
    expect(permit.consumeIfFresh()).toBe(false);
    expect(clock).toHaveBeenCalledTimes(1);
  });
});
