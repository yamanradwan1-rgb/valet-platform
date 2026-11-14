import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  inspectUntrustedA01Reservation,
} from "../src/modules/anti-abuse/issue416-a01-reservation";
import {
  inspectUntrustedA01Finalization,
} from "../src/modules/anti-abuse/issue416-a01-finalization";

const OP = "00000000-0000-0000-0000-000000000001";
const OTHER_OP = "00000000-0000-0000-0000-000000000002";
const RESERVATION = "00000000-0000-0000-0000-000000000003";
const USER = "00000000-0000-0000-0000-000000000004";
const AUDIT = "00000000-0000-0000-0000-000000000005";
const DIGEST = "a".repeat(64);
const HASH = "anti-abuse-hmac-sha256:v1:" + "b".repeat(64);

const intent = {
  deploymentAudience: "test-audience",
  operationId: OP,
  canonicalIdentifier: "staff@example.test",
} as const;
const fakeDeriver = {
  key: (scope: string, identifier: string) => ({
    scope: scope as "v1:staff-login-identifier",
    keyHash: identifier.includes("@") ? HASH : "INVALID", lockHigh: 1, lockLow: 2,
  }),
};
const reservation = {
  reservationId: RESERVATION,
  audience: intent.deploymentAudience,
  operationId: OP,
  purpose: "STAFF_LOGIN_COMMIT",
  scope: "v1:staff-login-identifier",
  keyHash: HASH,
  state: "PENDING",
};
const finalize = {
  deploymentAudience: "test-audience",
  operationId: OP, reservationId: RESERVATION,
  userId: USER, payloadDigest: DIGEST,
  commitKnowledge: "CONFIRMED" as const,
};
const observed = {
  audience: "test-audience", operationId: OP,
  reservationId: RESERVATION, payloadDigest: DIGEST,
  limiterState: "PENDING", purpose: "STAFF_LOGIN_COMMIT",
  receiptOutcome: "COMPLETED", auditEventId: AUDIT,
  subjectUserId: USER, actorKind: "ANONYMOUS",
  organizationId: null, membershipId: null, challengeConsumed: true,
};

describe("Issue416 A01 dormant reservation contract (no SQL execution)", () => {
  it("cannot turn a UUID + matching HMAC or a forged deriver into admission", () => {
    expect(inspectUntrustedA01Reservation(fakeDeriver, intent, reservation)).toEqual({
      admissible: false, blocker: "TRUSTED_PRE_DOMAIN_BINDER_MISSING",
    });
    expect(inspectUntrustedA01Reservation(fakeDeriver, intent, undefined)).toEqual({
      admissible: false, blocker: "INVALID_CONTEXT",
    });
    expect(inspectUntrustedA01Reservation(fakeDeriver, intent, {
      ...reservation, reservationId: "arbitrary",
    }).blocker).toBe("INVALID_CONTEXT");
  });

  it("rejects cross-audience, operation, purpose, scope and HMAC mismatches", () => {
    const mismatches = [
      [{ ...reservation, audience: "other-tenant" }, "CROSS_AUDIENCE"],
      [{ ...reservation, operationId: OTHER_OP }, "CROSS_OPERATION"],
      [{ ...reservation, purpose: "RESET_ISSUE" }, "FOREIGN_PURPOSE"],
      [{ ...reservation, scope: "v1:staff-client-address" }, "FOREIGN_SCOPE"],
      [{ ...reservation, keyHash: "anti-abuse-hmac-sha256:v1:" + "0".repeat(64) }, "WRONG_KEY"],
    ] as const;
    for (const [row, expected] of mismatches) {
      expect(inspectUntrustedA01Reservation(fakeDeriver, intent, row).blocker)
        .toBe(expected);
    }
  });

  it("rejects wrong identifier normalization and already finalized states", () => {
    expect(inspectUntrustedA01Reservation(fakeDeriver, {
      ...intent, canonicalIdentifier: " STAFF@EXAMPLE.TEST ",
    }, reservation).blocker).toBe("INVALID_CONTEXT");
    for (const state of ["COUNTED", "IGNORED", "UNKNOWN"]) {
      expect(inspectUntrustedA01Reservation(fakeDeriver, intent, {
        ...reservation, state,
      }).blocker).toBe("INVALID_RESERVATION_STATE");
    }
  });
});

describe("Issue416 A01 dormant postdomain finalizer (no grant or discount)", () => {
  it("never treats forged receipt and perfect claimed audit as SQL attestation", () => {
    expect(inspectUntrustedA01Finalization(finalize, observed)).toEqual({
      authorized: false, blocker: "TRUSTED_POST_DOMAIN_FINALIZER_MISSING",
    });
  });

  it("holds UNKNOWN COMMIT regardless of claimed outcome or missing readback", () => {
    for (const row of [undefined, observed, {
      ...observed, receiptOutcome: "COMPLETED",
    }]) {
      expect(inspectUntrustedA01Finalization({
        ...finalize, commitKnowledge: "UNKNOWN",
      }, row).blocker).toBe("UNKNOWN_COMMIT");
    }
    expect(inspectUntrustedA01Finalization({
      ...finalize, commitKnowledge: "ROLLED_BACK",
    }, observed).authorized).toBe(false);
  });

  it("rejects changed payload, operation, audience and tenant impersonation", () => {
    const cases = [
      [{ ...observed, operationId: OTHER_OP }, "CROSS_OPERATION"],
      [{ ...observed, audience: "other-tenant" }, "CROSS_AUDIENCE"],
      [{ ...observed, payloadDigest: "c".repeat(64) }, "CHANGED_PAYLOAD"],
      [{ ...observed, organizationId: USER }, "CROSS_TENANT"],
      [{ ...observed, membershipId: USER }, "CROSS_TENANT"],
    ] as const;
    for (const [row, expected] of cases) {
      expect(inspectUntrustedA01Finalization(finalize, row).blocker)
        .toBe(expected);
    }
  });

  it("rejects fabricated audit, unconsumed challenge and wrong subject", () => {
    const cases = [
      { ...observed, receiptOutcome: "LINK_UNAVAILABLE" },
      { ...observed, auditEventId: null },
      { ...observed, subjectUserId: OTHER_OP },
      { ...observed, actorKind: "STAFF" },
      { ...observed, challengeConsumed: false },
      { ...observed, purpose: "RESET_ISSUE" },
    ];
    for (const row of cases) {
      expect(inspectUntrustedA01Finalization(finalize, row).blocker)
        .toBe("UNTRUSTED_AUDIT_OR_RECEIPT");
    }
  });

  it("does not mutate COUNTED/IGNORED or missing PENDING evidence", () => {
    for (const row of [undefined, ...["IGNORED", "COUNTED", "ABSENT"].map(
      (limiterState) => ({ ...observed, limiterState }),
    )]) {
      expect(inspectUntrustedA01Finalization(finalize, row).blocker)
        .toBe("TERMINAL_OR_MISSING_RESERVATION");
    }
  });

  it("does not trust caller time to resolve a 15-minute PENDING replay", () => {
    for (const claimedPendingAgeSeconds of [1, 899, 900, 901, 100_000]) {
      const forged = { ...observed, claimedPendingAgeSeconds };
      expect(inspectUntrustedA01Finalization(finalize, forged)).toEqual({
        authorized: false, blocker: "TRUSTED_POST_DOMAIN_FINALIZER_MISSING",
      });
    }
    // DB clock, immutable receipt and authorized fresh lease must define age
    // and finalization. The untrusted client clock cannot make that decision.
  });

  it("is not registered as a runtime provider or runnable SQL finalizer", () => {
    const root = new URL("../src/modules/anti-abuse/", import.meta.url);
    const moduleSource = readFileSync(new URL("anti-abuse.module.ts", root), "utf8");
    const reservationSource = readFileSync(new URL("issue416-a01-reservation.ts", root), "utf8");
    const finalizerSource = readFileSync(new URL("issue416-a01-finalization.ts", root), "utf8");
    expect(moduleSource).not.toContain("issue416-a01-");
    for (const source of [reservationSource, finalizerSource]) {
      expect(source).not.toMatch(/\b(?:transaction\.query|pool\.query|GRANT EXECUTE)\b/);
      expect(source).not.toMatch(/from ['"]\.\/anti-abuse\.service['"]/);
    }
  });
});
