import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { resetIssueQuotaKeys } from "../src/modules/anti-abuse/reset-issue-bundle-keys";

const originalSecret = process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
afterEach(() => {
  if (originalSecret === undefined)
    delete process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
  else process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = originalSecret;
});

describe("#416 R02 four-scope key plan (not the SQL reservation)", () => {
  it("derives exactly four canonically sorted HMAC scope hashes with fixed caps", () => {
    process.env.ANTI_ABUSE_HMAC_SECRET_B64URL =
      randomBytes(32).toString("base64url");
    const ids = {
      targetUserId: randomUUID(),
      issuerUserId: randomUUID(),
      organizationId: randomUUID(),
      trustedClientAddress: "198.51.100.42",
    };
    const derivation = new AntiAbuseKeyDeriver();
    const entries = resetIssueQuotaKeys({ key: derivation.derive.bind(derivation) }, ids);
    expect(entries).toHaveLength(4);
    expect(Object.fromEntries(entries.map((entry) => [entry.category, entry.limit])))
      .toEqual({
        issueTargetUser: 3,
        issueIssuerUser: 20,
        issueOrganization: 100,
        issueClientAddress: 30,
      });
    expect(entries.map((entry) => entry.key.scope)).toEqual(
      [...entries.map((entry) => entry.key.scope)].sort(),
    );
    expect(new Set(entries.map((entry) => entry.key.keyHash)).size).toBe(4);
    expect(entries.every((entry) =>
      /^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$/.test(entry.key.keyHash),
    )).toBe(true);
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain(ids.targetUserId);
    expect(serialized).not.toContain(ids.issuerUserId);
    expect(serialized).not.toContain(ids.organizationId);
    expect(serialized).not.toContain(ids.trustedClientAddress);
  });

  it("canonicalizes UUID text but refuses noncanonical address or missing identity", () => {
    process.env.ANTI_ABUSE_HMAC_SECRET_B64URL =
      randomBytes(32).toString("base64url");
    const uuid = randomUUID();
    const derive = { key: new AntiAbuseKeyDeriver().derive.bind(new AntiAbuseKeyDeriver()) };
    const request = {
      issuerUserId: uuid,
      targetUserId: randomUUID(),
      organizationId: randomUUID(),
      trustedClientAddress: "2001:db8::1",
    };
    expect(resetIssueQuotaKeys(derive, { ...request, issuerUserId: uuid.toUpperCase() }))
      .toEqual(resetIssueQuotaKeys(derive, request));
    expect(() => resetIssueQuotaKeys(derive, {
      ...request, trustedClientAddress: "::ffff:198.51.100.42",
    })).toThrow("canonical");
    expect(() => resetIssueQuotaKeys(derive, {
      ...request, targetUserId: "not-a-user",
    })).toThrow("UUID");
  });

  it("cannot generate reservation keys without an authoritative HMAC secret", () => {
    delete process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
    const derivation = new AntiAbuseKeyDeriver();
    const derive = vi.spyOn(derivation, "derive");
    expect(() => resetIssueQuotaKeys(
      { key: derivation.derive.bind(derivation) },
      {
        issuerUserId: randomUUID(),
        targetUserId: randomUUID(),
        organizationId: randomUUID(),
        trustedClientAddress: "198.51.100.8",
      },
    )).toThrow();
    expect(derive).toHaveBeenCalled();
  });
});
