import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  deriveHandoffVerifier,
  generateHandoffMaterial,
  handoffMaterialMatches,
} from "../src/modules/retrieval/handoff-secret";

const sessionId = "00000000-0000-4000-8000-000000000001";
let priorSecret: string | undefined;

beforeEach(() => {
  priorSecret = process.env.HANDOFF_VERIFIER_HMAC_SECRET_B64URL;
  process.env.HANDOFF_VERIFIER_HMAC_SECRET_B64URL =
    randomBytes(32).toString("base64url");
});

afterEach(() => {
  if (priorSecret === undefined) {
    delete process.env.HANDOFF_VERIFIER_HMAC_SECRET_B64URL;
  } else {
    process.env.HANDOFF_VERIFIER_HMAC_SECRET_B64URL = priorSecret;
  }
});

describe("handoff proof security", () => {
  it("generates exact pickup-code and opaque QR shapes", () => {
    for (let index = 0; index < 100; index += 1) {
      expect(generateHandoffMaterial("PICKUP_CODE")).toMatch(/^\d{4}$/);
      expect(generateHandoffMaterial("DYNAMIC_QR")).toMatch(
        /^vhq1\.[A-Za-z0-9_-]{43}$/,
      );
    }
  });

  it("domain-separates method and session verifiers", () => {
    const material = "0042";
    const verifier = deriveHandoffVerifier(sessionId, "PICKUP_CODE", material);
    expect(verifier).toMatch(/^hv1\.[A-Za-z0-9_-]{43}$/);
    expect(
      handoffMaterialMatches(verifier, sessionId, "PICKUP_CODE", material),
    ).toBe(true);
    expect(
      handoffMaterialMatches(verifier, sessionId, "PICKUP_CODE", "0043"),
    ).toBe(false);
    expect(
      handoffMaterialMatches(
        verifier,
        "00000000-0000-4000-8000-000000000002",
        "PICKUP_CODE",
        material,
      ),
    ).toBe(false);
  });

  it("fails closed for missing verifier configuration", () => {
    delete process.env.HANDOFF_VERIFIER_HMAC_SECRET_B64URL;
    expect(() =>
      deriveHandoffVerifier(sessionId, "PICKUP_CODE", "1234"),
    ).toThrowError(
      expect.objectContaining({ code: "HANDOFF_SECURITY_UNAVAILABLE" }),
    );
  });
});
