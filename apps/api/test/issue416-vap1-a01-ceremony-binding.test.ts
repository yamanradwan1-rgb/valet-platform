import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  generateStaffCredential,
  staffCredentialHash,
} from "../src/modules/auth/staff-auth-credential";
import { hashStaffPassword } from "../src/modules/auth/staff-password-hashing";
import { u2PrefixDigest } from "../src/modules/auth/vap1-typed/u2-record";
import { encodeU2StaffLoginPayload } from "../src/modules/auth/vap1-typed/u2-staff-login";
import { encodeU2StateFrame } from "../src/modules/auth/vap1-typed/u2-state";
import {
  assertA01CeremonyFrameCoherence,
  Vap1A01CeremonyBindingInvalid,
} from "../src/modules/auth/vap1/vap1-a01-ceremony-binding";
import { denyUntilVap1StaffLoginAdmission } from "../src/modules/auth/vap1/vap1-staff-login-preflight";
import {
  decodeVap1Proof,
  encodeVap1Proof,
} from "../src/modules/auth/vap1/vap1-proof";
import type { Vap1Field } from "../src/modules/auth/vap1/vap1-wire";

const UUID = {
  operation: "00000000-0000-4000-8000-000000000001",
  user: "00000000-0000-4000-8000-000000000002",
  session: "00000000-0000-4000-8000-000000000003",
  refresh: "00000000-0000-4000-8000-000000000004",
  limiter: "00000000-0000-4000-8000-000000000005",
};
const PASSWORD = "Original submitted A01 password only";
const AUDIENCE = "synthetic-auth-test";
const KEY_ID = "test-key-1";
const EPOCH = 4_294_967_297n;
const BACKEND = 9090;
const XID = 4_294_967_297n;
const SHA = (input: Buffer | string) =>
  createHash("sha256").update(input).digest();

type Input = Parameters<typeof assertA01CeremonyFrameCoherence>[0];
let authentic: Input;

beforeAll(async () => {
  const phc = await hashStaffPassword(PASSWORD);
  const rawAccess = generateStaffCredential("vsa1.");
  const rawRefresh = generateStaffCredential("vsr1.");
  const user = {
    id: UUID.user,
    status: "ACTIVE" as const,
    password_hash: phc,
  };
  const userFields: Vap1Field[] = [
    { id: 1, type: "uuid", value: UUID.user },
    { id: 2, type: "utf8", value: "staff@example.invalid" },
    { id: 3, type: "utf8", value: "ACTIVE" },
    { id: 4, type: "sha256", value: SHA(phc) },
  ];
  const userDigest = u2PrefixDigest(userFields);
  const admission: Vap1Field[] = [
    { id: 1, type: "utf8", value: AUDIENCE },
    { id: 2, type: "utf8", value: "USER" },
    {
      id: 3,
      type: "bytes",
      value: Buffer.concat([
        Buffer.from([1]),
        Buffer.from(UUID.user.replaceAll("-", ""), "hex"),
      ]),
    },
    { id: 4, type: "utf8", value: "ADMIT" },
    { id: 5, type: "u64", value: 1n },
    { id: 6, type: "u64", value: 1n },
    { id: 7, type: "sha256", value: userDigest },
    { id: 8, type: "null", value: null },
  ];
  const limiter: Vap1Field[] = [
    { id: 1, type: "uuid", value: UUID.limiter },
    { id: 2, type: "utf8", value: "v1:staff-login-identifier" },
    { id: 3, type: "sha256", value: Buffer.alloc(32, 0x12) },
    { id: 4, type: "utf8", value: "PENDING" },
    { id: 5, type: "uuid", value: UUID.operation },
  ];
  const payloadBytes = encodeU2StaffLoginPayload({
    operationId: UUID.operation,
    userId: UUID.user,
    verifiedPasswordDigest: SHA(phc),
    newSessionId: UUID.session,
    newRefreshId: UUID.refresh,
    newAccessHash: staffCredentialHash("access", rawAccess),
    newRefreshHash: staffCredentialHash("refresh", rawRefresh),
    limiterReservationId: UUID.limiter,
  });
  const stateBytes = encodeU2StateFrame({
    operationId: UUID.operation,
    purpose: "STAFF_LOGIN_COMMIT",
    keyPromotionEpoch: EPOCH,
    groups: {
      5: [admission],
      6: [[...userFields, { id: 5, type: "sha256", value: userDigest }]],
      19: [limiter],
    },
  });
  const proofBytes = encodeVap1Proof({
    keyId: KEY_ID,
    audience: AUDIENCE,
    purpose: "STAFF_LOGIN_COMMIT",
    operationId: UUID.operation,
    challengeNonce: Buffer.alloc(32, 0xac),
    backendPid: BACKEND,
    fullXid: XID,
    actorKind: "ANONYMOUS",
    actorUserId: null,
    actorSessionId: null,
    organizationId: null,
    membershipId: null,
    subjectUserId: UUID.user,
    stateDigest: SHA(stateBytes),
    payloadDigest: SHA(payloadBytes),
    issuedAtMs: 1_700_000_000_000n,
    expiresAtMs: 1_700_000_030_000n,
  });
  authentic = {
    user,
    submittedPassword: PASSWORD,
    newRawAccessToken: rawAccess,
    newRawRefreshToken: rawRefresh,
    newSessionId: UUID.session,
    newRefreshId: UUID.refresh,
    operationId: UUID.operation,
    limiterReservationId: UUID.limiter,
    deploymentAudience: AUDIENCE,
    selectedKeyId: KEY_ID,
    selectedKeyEpoch: EPOCH,
    ownedBackendPid: BACKEND,
    ownedFullXid: XID,
    payloadBytes,
    stateBytes,
    proofBytes,
  };
});

const denied = async (changed: Partial<Input>) =>
  expect(
    assertA01CeremonyFrameCoherence({ ...authentic, ...changed }),
  ).rejects.toThrow(Vap1A01CeremonyBindingInvalid);

describe("Issue416 A01 genuine credential vs closed TLV coherence, NOT signer", () => {
  it("checks actual Argon2 and both fresh raw tokens but produces no proof or issuer authority", async () => {
    await expect(
      assertA01CeremonyFrameCoherence(authentic),
    ).resolves.toBeUndefined();
    expect(denyUntilVap1StaffLoginAdmission).toThrow();
  });

  it("rejects incorrect, missing and stale PHC password even with otherwise copied SQL bytes", async () => {
    await denied({ submittedPassword: "incorrect submitted password" });
    await denied({ user: undefined });
    await denied({ user: { ...authentic.user!, status: "DISABLED" } });
    await denied({ user: { ...authentic.user!, password_hash: null } });
    await denied({ user: { ...authentic.user!, id: UUID.session } });
    await denied({ user: { ...authentic.user!, password_hash: "forged PHC" } });
  });

  it("rejects copied SQL-hash claims without each exact new raw credential", async () => {
    await denied({
      newRawAccessToken: "staff-access-sha256:v1:" + "a".repeat(64),
    });
    await denied({
      newRawRefreshToken: staffCredentialHash(
        "refresh",
        authentic.newRawRefreshToken,
      ),
    });
    await denied({ newRawRefreshToken: generateStaffCredential("vsr1.") });
    await denied({ newRawAccessToken: generateStaffCredential("vsa1.") });
    await denied({ newRawAccessToken: "vsa1." + "a".repeat(43) + "\n" });
  });

  it("fences operation, new IDs and pre-domain limiter identity", async () => {
    await denied({ operationId: UUID.session });
    await denied({ newSessionId: UUID.refresh });
    await denied({ newRefreshId: UUID.session });
    await denied({ limiterReservationId: UUID.refresh });
  });

  it("fences independent audience/key epoch and same backend/full XID", async () => {
    await denied({ deploymentAudience: "cross-tenant-audience" });
    await denied({ selectedKeyId: "other-key" });
    await denied({ selectedKeyEpoch: EPOCH + 1n });
    await denied({ ownedBackendPid: BACKEND + 1 });
    await denied({ ownedFullXid: XID + 1n });
  });

  it("rejects tampering with proof digests and canonical payload/state bytes", async () => {
    const proof = Buffer.from(authentic.proofBytes);
    proof[proof.length - 1] = proof[proof.length - 1]! ^ 1;
    await denied({ proofBytes: proof });
    await denied({
      payloadBytes: Buffer.concat([authentic.payloadBytes, Buffer.from([0])]),
    });
    await denied({
      stateBytes: Buffer.concat([authentic.stateBytes, Buffer.from([0])]),
    });
  });

  it("rejects switching anonymous password login to copied Staff identity, target or another purpose", async () => {
    const original = decodeVap1Proof(authentic.proofBytes);
    for (const change of [
      {
        actorKind: "STAFF" as const,
        actorUserId: UUID.user,
        actorSessionId: UUID.session,
      },
      { subjectUserId: UUID.session },
      { organizationId: UUID.session },
      { membershipId: UUID.session },
      { purpose: "STAFF_REFRESH_ROTATE_OR_REPLAY_REVOKE" },
      { operationId: UUID.refresh },
    ]) {
      await denied({ proofBytes: encodeVap1Proof({ ...original, ...change }) });
    }
  });

  it("does not establish a live PostgreSQL challenge, U1 signing key or MAC even with a fully forged consistent descriptor", async () => {
    // A caller that knows a synthetic PHC/password may construct every
    // SQL-like field. This component checks coherence only, never authority.
    await expect(
      assertA01CeremonyFrameCoherence(authentic),
    ).resolves.toBeUndefined();
    expect(denyUntilVap1StaffLoginAdmission).toThrow();
  });

  it("cannot receive injected SQL hooks, a verifier callback or key material to sign arbitrary frames", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/modules/auth/vap1/vap1-a01-ceremony-binding.ts",
      ),
      "utf8",
    );
    expect(source).not.toMatch(
      /\b(?:createHmac|createSign|sign|process\.env)\s*\(/,
    );
    expect(source).not.toMatch(/\b(?:pool|transaction|client)\.query\s*\(/);
    expect(source).not.toMatch(
      /\b(?:lookupPool|queryHook|signerCallback|passwordVerifier)\s*:/,
    );
    expect(denyUntilVap1StaffLoginAdmission.length).toBe(0);
  });
});
