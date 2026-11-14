import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  validateVap1OfflineKeyringFormat,
  Vap1OfflineKeyringInvalid,
} from "../src/modules/auth/vap1/vap1-keyring-offline-format";
import { denyUntilVap1StaffLoginAdmission } from "../src/modules/auth/vap1/vap1-staff-login-preflight";

const AUDIENCE = "vaylet-stage-example";
const FILLER_ONLY = Buffer.alloc(32, 0x25).toString("base64url");
const SECOND_FILLER = Buffer.alloc(32, 0x65).toString("base64url");
const one = {
  keyId: "offline-first",
  audience: AUDIENCE,
  keyB64url: FILLER_ONLY,
};
const two = {
  keyId: "offline-second",
  audience: AUDIENCE,
  keyB64url: SECOND_FILLER,
};
const format = (entries: unknown) => JSON.stringify(entries);
const validate = (candidate: unknown, audience: unknown = AUDIENCE) =>
  validateVap1OfflineKeyringFormat(candidate, audience);
const denied = (candidate: unknown, audience: unknown = AUDIENCE) =>
  expect(() => validate(candidate, audience)).toThrow(
    Vap1OfflineKeyringInvalid,
  );

describe("Issue416 U1 offline-only secret-input format (NEVER a VAP1 issuer)", () => {
  it("accepts exactly one or two independent 256-bit canonical roots, with no output", () => {
    expect(validate(format([one]))).toBeUndefined();
    expect(validate(format([one, two]))).toBeUndefined();
    // Successful format parsing has zero impact on the issuer/admission fence.
    expect(denyUntilVap1StaffLoginAdmission).toThrow();
  });

  it("rejects empty, oversized, invalid JSON, noncanonical JSON and duplicate JSON keys", () => {
    for (const value of [
      undefined,
      "",
      "[]",
      format([one, two, { ...two, keyId: "third" }]),
      "[",
      " ".repeat(1025),
      format([one]).replace(',"audience"', ', "audience"'),
      format([one]).replace('"keyId":', '"keyId":"offline-other","keyId":'),
      format([one]).replace('"keyB64url":', '"keyB64url":"x","keyB64url":'),
    ]) {
      denied(value);
    }
  });

  it("rejects extra, missing, reordered or prototype-sensitive fields", () => {
    const cases = [
      { keyId: one.keyId, audience: AUDIENCE },
      { ...one, role: "ACTIVE_SIGNING" },
      { audience: AUDIENCE, keyId: one.keyId, keyB64url: one.keyB64url },
      { ...one, constructor: { unexpected: true } },
      { ...one, ...JSON.parse('{"__proto__":{"injected":true}}') },
      { ...one, keyId: "__proto__" },
      { ...one, keyId: 100 },
    ];
    for (const value of cases) denied(format([value]));
  });

  it("requires exact audience supplied by the trusted deployment owner, never an entry assertion", () => {
    denied(format([one]), "other-audience");
    denied(format([{ ...one, audience: "other-audience" }]));
    denied(format([one]), "");
    denied(format([one]), "a\n");
    denied(format([one]), { audience: AUDIENCE });
    denied(format([{ ...one, audience: AUDIENCE + "\n" }]));
    denied(format([one, { ...two, audience: "other-audience" }]));
  });

  it("rejects duplicate/invalid key identifiers and malformed or noncanonical root bytes", () => {
    for (const value of [
      [one, { ...two, keyId: one.keyId }],
      [one, { ...two, keyB64url: one.keyB64url }],
      [{ ...one, keyId: "1-not-alphabetic" }],
      [{ ...one, keyId: "offline-id\n" }],
      [{ ...one, keyId: "a".repeat(65) }],
      [{ ...one, keyB64url: "fake" }],
      [{ ...one, keyB64url: "A".repeat(43) }],
      [{ ...one, keyB64url: FILLER_ONLY + "=" }],
      [{ ...one, keyB64url: Buffer.alloc(31).toString("base64url") }],
      [{ ...one, keyB64url: Buffer.alloc(33).toString("base64url") }],
      [{ ...one, keyB64url: "" }],
    ])
      denied(format(value));
  });

  it("never includes raw input, key identifier or root in an error", () => {
    const secret = "fake-secret-do-not-echo";
    let thrown: unknown;
    try {
      validate(format([{ ...one, keyB64url: secret }]));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Vap1OfflineKeyringInvalid);
    expect(String(thrown)).toBe(
      "Vap1OfflineKeyringInvalid: VAP1 offline keyring format is invalid.",
    );
    expect(String(thrown)).not.toContain(secret);
    expect(String(thrown)).not.toContain(one.keyId);
  });

  it("has no environment/config fallback, HMAC, SQL, exportable key or signing oracle", () => {
    const file = resolve(
      process.cwd(),
      "src/modules/auth/vap1/vap1-keyring-offline-format.ts",
    );
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/\bprocess\.env\s*[.[]/);
    expect(source).not.toMatch(
      /\b(?:createHmac|sign|connect|query|execute)\s*\(/,
    );
    expect(source).not.toMatch(
      /\b(?:return|export)\s+(?:bytes|keyB64url|entry)\s*;/,
    );
    expect(source).toMatch(/bytes\.fill\(0\)/);
    expect(denyUntilVap1StaffLoginAdmission).toThrow();
  });
});
