import { describe, expect, it } from "vitest";

import {
  evaluateMfaAssurance,
  type MfaAssuranceSnapshot,
} from "../src/modules/auth/mfa/mfa-assurance-policy";

const t0 = new Date("2026-09-16T00:00:00.000Z");

function snapshot(input: Partial<MfaAssuranceSnapshot> = {}): MfaAssuranceSnapshot {
  return {
    factorCurrent: true,
    lastAdminActivityAt: t0,
    mfaAuthenticatedAt: t0,
    mfaFactorId: "00000000-0000-4000-8000-000000000001",
    ...input,
  };
}

function at(milliseconds: number): Date {
  return new Date(t0.getTime() + milliseconds);
}

describe("Company Admin MFA assurance policy", () => {
  it("requires step-up when no current factor-backed assurance exists", () => {
    for (const candidate of [
      snapshot({ mfaAuthenticatedAt: null }),
      snapshot({ lastAdminActivityAt: null }),
      snapshot({ mfaFactorId: null }),
      snapshot({ factorCurrent: false }),
    ]) {
      expect(evaluateMfaAssurance(candidate, t0, false)).toBe(
        "NO_MFA_ASSURANCE",
      );
    }
  });

  it("enforces the exact non-sliding eight-hour maximum", () => {
    expect(evaluateMfaAssurance(snapshot({ lastAdminActivityAt: at(7.9 * 3_600_000) }), at(8 * 3_600_000 - 1), false)).toBe(
      "ASSURANCE_VALID",
    );
    expect(evaluateMfaAssurance(snapshot({ lastAdminActivityAt: at(7.9 * 3_600_000) }), at(8 * 3_600_000), false)).toBe(
      "MFA_MAX_AGE_EXPIRED",
    );
  });

  it("enforces the exact thirty-minute inactivity boundary", () => {
    expect(evaluateMfaAssurance(snapshot(), at(30 * 60_000 - 1), false)).toBe(
      "ASSURANCE_VALID",
    );
    expect(evaluateMfaAssurance(snapshot(), at(30 * 60_000), false)).toBe(
      "ADMIN_INACTIVITY_EXPIRED",
    );
  });

  it("allows exactly five minutes of sensitive freshness and rejects older proof", () => {
    expect(evaluateMfaAssurance(snapshot({ lastAdminActivityAt: at(4 * 60_000) }), at(5 * 60_000), true)).toBe(
      "ASSURANCE_VALID",
    );
    expect(evaluateMfaAssurance(snapshot({ lastAdminActivityAt: at(4 * 60_000) }), at(5 * 60_000 + 1), true)).toBe(
      "SENSITIVE_FRESHNESS_EXPIRED",
    );
  });

  it("does not slide the eight-hour origin when admin activity is recent", () => {
    const recentActivity = at(7 * 3_600_000 + 50 * 60_000);
    expect(
      evaluateMfaAssurance(
        snapshot({ lastAdminActivityAt: recentActivity }),
        at(8 * 3_600_000),
        false,
      ),
    ).toBe("MFA_MAX_AGE_EXPIRED");
  });
});
