import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Response } from "@playwright/test";
import { afterEach, describe, expect, it } from "vitest";

import {
  consumeOneTimeMfaState, firstTimelineCollector, readOneTimeMfaState,
  requireOwnedBrowserTarget, validateOwnedBrowserAttestation,
} from "../../../../e2e-runtime/issue300-browser-safety";

const sha = "a".repeat(40);
const origin = "http://127.0.0.1:3217";
const apiOrigin = "http://127.0.0.1:3218";
const now = Date.parse("2026-10-18T18:00:00Z");
// Ephemeral test key only; never the real Owner issuer or private material.
const signer = generateKeyPairSync("ed25519");
const ownerPublicKey = signer.publicKey.export({ format: "der", type: "spki" }).toString("base64");

function attestation(overrides: Record<string, unknown> = {}) {
  const payload = {
    kind: "ISSUE300_W7_ISOLATED_BROWSER_TARGET_V1",
    candidateSha: sha, leaseId: "w7-dedicated-browser-lease",
    dashboardOrigin: origin, apiOrigin, allowedOrigins: [origin],
    expiresAt: new Date(now + 8 * 60_000).toISOString(),
    ...overrides,
  };
  const bytes = Buffer.from(JSON.stringify(payload));
  return {
    baseURL: origin, candidateSha: sha, leaseId: payload.leaseId as string,
    testOnly: "1", pinnedDigest: createHash("sha256").update(bytes).digest("hex"),
    attestationBytes: bytes, checkoutSha: sha, now, ownerPublicKey,
    ownerSignature: sign(null, bytes, signer.privateKey),
  };
}

describe("W7 isolated portable browser target, source-only", () => {
  it("allows only the one owner pinned isolated origin, SHA, lease and audit path", () => {
    const grant = validateOwnedBrowserAttestation(attestation());
    expect(() => requireOwnedBrowserTarget(origin, "/audit-log?investigationDemo=1", grant))
      .not.toThrow();
    for (const path of ["/", "/audit-log#x", "/audit-log?investigationDemo=0",
      "/audit-log?other=1", "/audit-log?investigationDemo=1&other=x",
      "https://example.org/audit-log"]) {
      expect(() => requireOwnedBrowserTarget(origin, path, grant)).toThrow();
    }
    expect(() => requireOwnedBrowserTarget("http://127.0.0.1:3114", "/audit-log", grant))
      .toThrow();
  });

  it("fails closed on unpinned bytes, test flag, wrong checkout SHA or wrong lease", () => {
    const valid = attestation();
    expect(() => validateOwnedBrowserAttestation({ ...valid, pinnedDigest: "0".repeat(64) }))
      .toThrow();
    expect(() => validateOwnedBrowserAttestation({ ...valid, testOnly: undefined })).toThrow();
    expect(() => validateOwnedBrowserAttestation({ ...valid, checkoutSha: "b".repeat(40) }))
      .toThrow();
    expect(() => validateOwnedBrowserAttestation({ ...valid, leaseId: "foreign-lease" }))
      .toThrow();
    expect(() => validateOwnedBrowserAttestation({ ...valid, candidateSha: "b".repeat(40) }))
      .toThrow();
  });

  it("cannot self-forge an Owner approval by replacing both manifest and env SHA256", () => {
    const authorized = attestation();
    const forgery = Buffer.from(JSON.stringify({ ...JSON.parse(authorized.attestationBytes.toString()),
      dashboardOrigin: "http://127.0.0.1:3999",
      allowedOrigins: ["http://127.0.0.1:3999"] }));
    const forgedInputs = { ...authorized, baseURL: "http://127.0.0.1:3999",
      attestationBytes: forgery,
      pinnedDigest: createHash("sha256").update(forgery).digest("hex") };
    expect(() => validateOwnedBrowserAttestation(forgedInputs)).toThrow(/signature/);
    const rogue = generateKeyPairSync("ed25519");
    expect(() => validateOwnedBrowserAttestation({ ...forgedInputs,
      ownerSignature: sign(null, forgery, rogue.privateKey) })).toThrow(/signature/);
    expect(() => validateOwnedBrowserAttestation({ ...authorized,
      ownerSignature: Buffer.alloc(64) })).toThrow(/signature/);
  });

  it("rejects the human dashboard, default API, prod/localhost, and arbitrary unattested ports", () => {
    for (const bad of ["http://127.0.0.1:3114", "http://127.0.0.1:3165",
      "http://127.0.0.1:3003", "https://127.0.0.1:3217",
      "http://localhost:3217", "https://valet.example.com",
      "http://0.0.0.0:3217"]) {
      const input = attestation({ dashboardOrigin: bad, allowedOrigins: [bad] });
      expect(() => validateOwnedBrowserAttestation({ ...input, baseURL: bad })).toThrow();
    }
    expect(() => validateOwnedBrowserAttestation({
      ...attestation({ allowedOrigins: [origin, "http://127.0.0.1:3999"] }),
    })).toThrow();
    expect(() => validateOwnedBrowserAttestation({
      ...attestation({ apiOrigin: "http://127.0.0.1:3165" }),
    })).toThrow();
  });

  it("rejects stale and overlong leases, including invalid timestamps", () => {
    for (const expiresAt of ["not-a-date", new Date(now).toISOString(),
      new Date(now - 1).toISOString(), new Date(now + 16 * 60_000).toISOString()]) {
      expect(() => validateOwnedBrowserAttestation(attestation({ expiresAt }))).toThrow();
    }
  });
});

describe("W7 first Timeline response race, source-only", () => {
  const expected = "12345678-1234-4234-8234-123456789abc";
  const url = `${origin}/v1/staff/management/organizations/abc/locations/def/audit-investigations/sessions/${expected}/timeline`;
  const reply = (value: string) => ({ url: () => value }) as unknown as Response;

  it("keeps the first response already observed before any later click", () => {
    const collector = firstTimelineCollector(origin, expected);
    const automatic = reply(url);
    collector.capture(automatic); // Search auto-selects first row before user clicks.
    expect(collector.first).toBe(automatic);
    collector.capture(reply(url)); // A duplicate or later click cannot replace it.
    expect(collector.first).toBe(automatic);
  });

  it("accepts selected later session but rejects other origin/UUID/cursor", () => {
    const collector = firstTimelineCollector(origin, expected);
    collector.capture(reply(url + "?cursor=opaque"));
    collector.capture(reply(url.replace(origin, "http://127.0.0.1:3114")));
    collector.capture(reply(url.replace(expected, randomUUID())));
    expect(collector.first).toBeNull();
    const selected = reply(url);
    collector.capture(selected);
    expect(collector.first).toBe(selected);
  });
});

describe("W7 one-use cookie custody", () => {
  let fixtureDir = "";
  afterEach(() => { if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true }); });

  it("uses captured cookie bytes after the file changes and denies duplicate claims", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "issue300-w10-static-"));
    const stateFile = join(fixtureDir, "state.json");
    const fakeState = (value: string) => ({
      cookies: [{ name: "__Secure-vaylet_staff_refresh", value, domain: "127.0.0.1",
        path: "/v1/staff/auth", httpOnly: true, secure: true, sameSite: "Strict", expires: -1 }],
      origins: [],
    });
    writeFileSync(stateFile, JSON.stringify(fakeState("synthetic-" + randomUUID())));
    const frozen = readOneTimeMfaState(stateFile);
    writeFileSync(stateFile, JSON.stringify(fakeState("different-synthetic-" + randomUUID())));
    expect(readFileSync(stateFile, "utf8")).not.toContain(frozen.cookies[0]!.value);
    consumeOneTimeMfaState(frozen);
    expect(() => consumeOneTimeMfaState(frozen)).toThrow();
  });
});
