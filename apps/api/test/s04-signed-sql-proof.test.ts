import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { signS04StaffActivationSuccess } from "../src/modules/anti-abuse/s04-signed-sql-proof";

describe("S04 signed Staff activation proof", () => {
  it("binds the exact reservation, activation scope and invitation verifier", () => {
    const previousProofKey = process.env.ANTI_ABUSE_SQL_PROOF_SECRET_B64URL;
    const previousIdentityKey = process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
    const proofKey = Buffer.alloc(32, 0x54);
    process.env.ANTI_ABUSE_SQL_PROOF_SECRET_B64URL = proofKey.toString("base64url");
    process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = Buffer.alloc(32, 0x55).toString("base64url");
    try {
      const id = "00000000-0000-4000-8000-000000000001";
      const scope = "v1:staff-activation-credential";
      const keyHash = `anti-abuse-hmac-sha256:v1:${"a".repeat(64)}`;
      const invitationHash = `staff-invite-sha256:v1:${"b".repeat(64)}`;
      const transactionId = "4294967297";
      const proof = signS04StaffActivationSuccess(
        id,
        { scope, keyHash, lockHigh: 1, lockLow: 2 },
        invitationHash,
        transactionId,
      );
      const expected = createHmac("sha256", proofKey)
        .update(
          `s04-v1|STAFF_ACTIVATION|${id}|${scope}|${keyHash}|${invitationHash}|${transactionId}|${proof.nonce}|${proof.expiresMs}`,
          "utf8",
        )
        .digest("hex");
      expect(proof.mac).toBe(expected);
      expect(proof.expiresMs).toBeGreaterThan(Date.now());
      expect(proof.expiresMs).toBeLessThanOrEqual(Date.now() + 15_000);
      expect(() => signS04StaffActivationSuccess(
        id,
        { scope: "v1:guest-token", keyHash, lockHigh: 1, lockLow: 2 },
        invitationHash,
        transactionId,
      )).toThrow(/arguments are invalid/);
      expect(() => signS04StaffActivationSuccess(
        id,
        { scope, keyHash, lockHigh: 1, lockLow: 2 },
        "raw-invitation-token",
        transactionId,
      )).toThrow(/arguments are invalid/);
      expect(() => signS04StaffActivationSuccess(
        id,
        { scope, keyHash, lockHigh: 1, lockLow: 2 },
        invitationHash,
        "not-an-xid8",
      )).toThrow(/arguments are invalid/);
    } finally {
      if (previousProofKey === undefined) delete process.env.ANTI_ABUSE_SQL_PROOF_SECRET_B64URL;
      else process.env.ANTI_ABUSE_SQL_PROOF_SECRET_B64URL = previousProofKey;
      if (previousIdentityKey === undefined) delete process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
      else process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = previousIdentityKey;
      proofKey.fill(0);
    }
  });
});
