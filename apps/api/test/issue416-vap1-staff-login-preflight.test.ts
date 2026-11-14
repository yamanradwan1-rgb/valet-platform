import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { generate } from "otplib";
import { describe, expect, it, vi } from "vitest";

import { hashSubmittedStaffRefresh } from "../src/modules/auth/staff-auth-vap1-refresh";
import { staffCredentialHash } from "../src/modules/auth/staff-auth-credential";
import { verifySubmittedStaffLoginPassword } from "../src/modules/auth/staff-auth-vap1-login-ceremony";
import { hashStaffPassword } from "../src/modules/auth/staff-password-hashing";
import { Argon2StaffPasswordVerifier } from "../src/modules/auth/staff-password-verification";
import {
  generateTotpSecret,
  verifyTotpCode,
} from "../src/modules/auth/mfa/mfa-totp";
import {
  denyUntilVap1StaffLoginAdmission,
  Vap1StaffLoginAdmissionUnavailable,
} from "../src/modules/auth/vap1/vap1-staff-login-preflight";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const RAW_PASSWORD = "Real password for source-only test 416";
const RAW_REFRESH = `vsr1.${Buffer.alloc(32, 0x6e).toString("base64url")}`;
const blocked = () =>
  expect(denyUntilVap1StaffLoginAdmission).toThrow(
    Vap1StaffLoginAdmissionUnavailable,
  );

describe("Issue416 W23: deny-only VAP1 signer cannot reveal the password via query hooks", () => {
  it("rejects valid and invalid real Argon2 ceremonies without handing callbacks to the issuer", async () => {
    const phc = await hashStaffPassword(RAW_PASSWORD);
    const verifier = new Argon2StaffPasswordVerifier();
    const user = { id: USER_ID, status: "ACTIVE" as const, password_hash: phc };
    expect(
      await verifySubmittedStaffLoginPassword({
        user,
        submittedPassword: RAW_PASSWORD,
        verifier,
      }),
    ).toBe(phc);
    await expect(
      verifySubmittedStaffLoginPassword({
        user,
        submittedPassword: "wrong",
        verifier,
      }),
    ).rejects.toThrow();
    // Neither successful verification nor a trusted-looking PHC is an issuer.
    blocked();
    blocked();
  });

  it("refuses valid raw refresh possession and stored hashes alike", () => {
    expect(hashSubmittedStaffRefresh(RAW_REFRESH)).toBe(
      staffCredentialHash("refresh", RAW_REFRESH),
    );
    expect(
      hashSubmittedStaffRefresh(staffCredentialHash("refresh", RAW_REFRESH)),
    ).toBeUndefined();
    blocked();
  });

  it("does not turn valid submitted TOTP into VAP1 issuer authority", async () => {
    const now = new Date("2026-11-13T12:00:15.000Z");
    const secret = generateTotpSecret();
    const code = await generate({
      algorithm: "sha1",
      digits: 6,
      epoch: Math.floor(now.getTime() / 30_000) * 30,
      period: 30,
      secret,
      strategy: "totp",
    });
    expect(await verifyTotpCode({ code, now, secret })).toBeDefined();
    blocked();
  });

  it("does not call an injected SQL lookup, transaction or fake signer when invoked dynamically", () => {
    const lookup = vi.fn(() => {
      throw Error("attacker observed a credential lookup");
    });
    const transaction = vi.fn(() => {
      throw Error("attacker observed a password-dependent lock");
    });
    const signer = vi.fn(() => Buffer.alloc(32));
    const attackerInput = {
      lookupPool: { query: lookup },
      transaction: { query: transaction },
      signedProof: signer,
      audience: "test-audience",
      operationId: USER_ID,
      submittedPassword: RAW_PASSWORD,
      userId: USER_ID,
      passwordVerified: true,
      verifiedPhc: "attacker-controlled stored hash",
      actor: "STAFF",
      sessionId: USER_ID,
    };
    // At runtime JavaScript callers can supply extra arguments despite TS.
    const invoke = denyUntilVap1StaffLoginAdmission as (
      ...args: unknown[]
    ) => never;
    for (const attempt of [
      attackerInput,
      { ...attackerInput, submittedPassword: "wrong" },
      { ...attackerInput, submittedPassword: undefined },
      { ...attackerInput, passwordVerified: false },
      undefined,
    ]) {
      expect(() => invoke(attempt)).toThrow(Vap1StaffLoginAdmissionUnavailable);
    }
    expect(lookup).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(signer).not.toHaveBeenCalled();
  });

  it("exports no constructor, query-hook capability or flexible signer by source contract", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/modules/auth/vap1/vap1-staff-login-preflight.ts",
      ),
      "utf8",
    );
    expect(denyUntilVap1StaffLoginAdmission.length).toBe(0);
    expect(source).toMatch(
      /export function denyUntilVap1StaffLoginAdmission\(\): never/,
    );
    expect(source).not.toMatch(
      /\binput\s*:\s*\{|\blookupPool\s*:|\btransaction\s*:\s*PostgresTransaction/,
    );
    expect(source).not.toMatch(
      /\b(?:await|pool|transaction|client)\.query\s*\(/,
    );
    expect(source).not.toMatch(
      /\b(?:createHmac|sign|loadKey|readKey|process\.env)\s*\(/,
    );
  });

  it("has no credential-dependent calls on any possible public entry path", () => {
    const lookup = vi.fn();
    const transaction = vi.fn();
    const invoke = denyUntilVap1StaffLoginAdmission as (
      ...args: unknown[]
    ) => never;
    for (const payload of [
      { lookupPool: { query: lookup }, transaction: { query: transaction } },
      { submittedPassword: RAW_PASSWORD },
      { submittedPassword: "wrong" },
      { password_hash: "PHC", isAuthenticated: true },
      { totpValid: true, recoveryValid: true, refreshValid: true },
      { signedBytes: Buffer.alloc(32), keyId: "k1" },
    ]) {
      expect(() => invoke(payload)).toThrowError(
        "VAP1 Staff Login authority is unavailable.",
      );
    }
    expect(lookup).toHaveBeenCalledTimes(0);
    expect(transaction).toHaveBeenCalledTimes(0);
  });
});
