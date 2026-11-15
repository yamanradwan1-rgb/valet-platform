import { createHash, createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { hashSubmittedStaffRefresh } from "../src/modules/auth/staff-auth-vap1-refresh";
import { requireRequestBearerPossession } from "../src/modules/auth/staff-auth-vap1-bearer";
import { verifySubmittedStaffLoginPassword } from "../src/modules/auth/staff-auth-vap1-login-ceremony";
import { staffCredentialHash } from "../src/modules/auth/staff-auth-credential";
import { STAFF_AUTH_DUMMY_PASSWORD_HASH } from "../src/modules/auth/staff-password-verification";
import * as proofCodec from "../src/modules/auth/vap1/vap1-proof";
import * as wireCodec from "../src/modules/auth/vap1/vap1-wire";

const UUID = "00000000-0000-4000-8000-000000000001";
const SYNTHETIC_KEY = Buffer.from(Array.from({ length: 32 }, (_, i) => i));

describe("Issue416 P0-C: source credential helpers are NOT signer capabilities", () => {
  it("a returned PHC can be reproduced by a caller with a fake verifier", async () => {
    const verifier = { verify: vi.fn().mockResolvedValue(true) };
    const phc = await verifySubmittedStaffLoginPassword({
      user: {
        id: UUID,
        status: "ACTIVE",
        password_hash: STAFF_AUTH_DUMMY_PASSWORD_HASH,
      },
      submittedPassword: "not-the-secret",
      verifier,
    });
    expect(phc).toBe(STAFF_AUTH_DUMMY_PASSWORD_HASH);
    expect(verifier.verify).toHaveBeenCalledExactlyOnceWith(
      phc,
      "not-the-secret",
    );
    // Production trusts its Argon2 verifier; PHC itself carries no evidence
    // that the trusted verifier ran, nor a locked-state/transaction binding.
  });

  it("a canonical but unissued raw refresh has only a computable lookup hash", () => {
    const unissuedRaw = `vsr1.${Buffer.alloc(32, 0x3c).toString("base64url")}`;
    expect(hashSubmittedStaffRefresh(unissuedRaw)).toBe(
      staffCredentialHash("refresh", unissuedRaw),
    );
    expect(
      hashSubmittedStaffRefresh(staffCredentialHash("refresh", unissuedRaw)),
    ).toBeUndefined();
    // Only the private, locked credential lineage can prove issuance/currentness.
  });

  it("a matching bearer/hash pair does not establish DB session authority", () => {
    const raw = `vsa1.${Buffer.alloc(32, 0x7d).toString("base64url")}`;
    const context = { accessTokenHash: staffCredentialHash("access", raw) };
    expect(() =>
      requireRequestBearerPossession(`Bearer ${raw}`, context),
    ).not.toThrow();
    expect(() => requireRequestBearerPossession(undefined, context)).toThrow();
    // The pair can be assembled without a DB lookup: the issuer must recheck
    // session/User/admission under the same locked transaction as the challenge.
  });

  it("the production codec exports neither a proof MAC signer nor a key loader", () => {
    expect(Object.keys(proofCodec).sort()).toEqual([
      "decodeVap1Proof",
      "encodeVap1Proof",
      "vap1FrameDigest",
    ]);
    expect(Object.keys(wireCodec).sort()).toEqual([
      "decodeVap1Frame",
      "encodeVap1Frame",
      "vap1StrictUtf8",
      "vap1U64",
    ]);
  });

  it("synthetic fixture HMAC is byte-sensitive, but is NOT SQL parity evidence", () => {
    const payloadDigest = createHash("sha256")
      .update(
        wireCodec.encodeVap1Frame(1, [{ id: 1, type: "utf8", value: "LOGIN" }]),
      )
      .digest();
    const fixture = {
      keyId: "k1",
      audience: "test",
      purpose: "LOGIN",
      operationId: "00000000-0000-0000-0000-000000000001",
      challengeNonce: Buffer.alloc(32, 0xa5),
      backendPid: 1234,
      fullXid: 4294967297n,
      actorKind: "ANONYMOUS" as const,
      actorUserId: null,
      actorSessionId: null,
      organizationId: null,
      membershipId: null,
      subjectUserId: "00000000-0000-0000-0000-000000000002",
      stateDigest: Buffer.alloc(32, 0x11),
      payloadDigest,
      issuedAtMs: 1700000000000n,
      expiresAtMs: 1700000030000n,
    };
    const proofBytes = proofCodec.encodeVap1Proof(fixture);
    const mac = (bytes: Buffer) =>
      createHmac("sha256", SYNTHETIC_KEY).update(bytes).digest("hex");
    expect(proofBytes.length).toBe(323);
    expect(mac(proofBytes)).toBe(
      "2b0da4ae9b1dc22e10bedc1e1c0a31fe1f2c339273f49092116eaa26d4799fbb",
    );
    expect(
      mac(proofCodec.encodeVap1Proof({ ...fixture, fullXid: 4294967298n })),
    ).not.toBe(mac(proofBytes));
    expect(
      mac(proofCodec.encodeVap1Proof({ ...fixture, backendPid: 1235 })),
    ).not.toBe(mac(proofBytes));
    expect(
      mac(
        proofCodec.encodeVap1Proof({
          ...fixture,
          stateDigest: Buffer.alloc(32),
        }),
      ),
    ).not.toBe(mac(proofBytes));
  });
});
