import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { decodeVap1Frame, encodeVap1Frame } from
  "../src/modules/auth/vap1/vap1-wire";
import {
  decodeVap1Proof, encodeVap1Proof, type Vap1ProofFields,
} from "../src/modules/auth/vap1/vap1-proof";
import {
  decodeU2StateGroup, encodeU2StateGroup,
} from "../src/modules/auth/vap1-typed/u2-state";
import { type Vap1Field } from "../src/modules/auth/vap1/vap1-wire";

const OP = "00000000-0000-0000-0000-000000000001";
const USER = "00000000-0000-0000-0000-000000000002";
const LIMITER = "00000000-0000-0000-0000-000000000003";
const STATE_ARRAY_DOMAIN = Buffer.from("VAYLET/VAP1/ARRAY\0", "ascii");

function admissionRow(audience: string, index: number): readonly Vap1Field[] {
  const rawUuid = Buffer.alloc(16);
  rawUuid.writeUInt32BE(index, 12);
  return [
    { id: 1, type: "utf8", value: audience },
    { id: 2, type: "utf8", value: "USER" },
    { id: 3, type: "bytes", value: Buffer.concat([
      Buffer.from([1]), rawUuid,
    ]) },
    { id: 4, type: "utf8", value: "ADMIT" },
    { id: 5, type: "u64", value: 1n },
    { id: 6, type: "u64", value: 1n },
    { id: 7, type: "sha256", value: Buffer.alloc(32, 0x17) },
    { id: 8, type: "null", value: null },
  ];
}

const proof: Vap1ProofFields = {
  keyId: "synthetic1",
  audience: "synthetic-tenant",
  purpose: "STAFF_LOGIN_COMMIT",
  operationId: OP,
  challengeNonce: Buffer.alloc(32, 0x11),
  backendPid: 12,
  fullXid: 2n ** 53n + 1n,
  actorKind: "ANONYMOUS",
  actorUserId: null,
  actorSessionId: null,
  organizationId: null,
  membershipId: null,
  subjectUserId: USER,
  stateDigest: Buffer.alloc(32, 0x32),
  payloadDigest: Buffer.alloc(32, 0x21),
  issuedAtMs: 1_700_000_000_000n,
  expiresAtMs: 1_700_000_030_000n,
};

describe("Issue416 P0-C W13 row/byte and frozen proof ABI — Node-only", () => {
  it("matches W13 118 exact 32768-byte state array cap including its 25-byte header", () => {
    // Every short admission row contributes 140 wire bytes; 230 'a' rows,
    // one 9-byte 'b' audience and one 256-byte 'c' audience total 32768.
    const rows = Array.from({ length: 230 }, (_, i) => admissionRow("a", i + 1));
    rows.push(admissionRow("b".repeat(9), 1));
    rows.push(admissionRow("c".repeat(256), 1));
    const bytes = encodeU2StateGroup(5, rows);
    expect(STATE_ARRAY_DOMAIN.length + 7).toBe(25);
    expect(bytes.length).toBe(32 * 1024);
    expect(decodeU2StateGroup(5, bytes)).toEqual(rows);
    const over = [...rows.slice(0, -2),
      admissionRow("b".repeat(10), 1), rows[rows.length - 1]!];
    expect(() => encodeU2StateGroup(5, over)).toThrow(/exceeds bound/);
    expect(() => decodeU2StateGroup(5, Buffer.concat([
      bytes, Buffer.from([0]),
    ]))).toThrow();
  });

  it("enforces W13 118 1024 row ceiling independently of the 32KiB cap", () => {
    expect(() => encodeU2StateGroup(5, Array.from(
      { length: 1025 }, (_, i) => admissionRow("a", i + 1),
    ))).toThrow(/count/);
    const empty = encodeU2StateGroup(5, []);
    const offset = STATE_ARRAY_DOMAIN.length + 3;
    const malformed1025 = Buffer.from(empty);
    malformed1025.writeUInt32BE(1025, offset);
    expect(() => decodeU2StateGroup(5, malformed1025)).toThrow(/excessive rows/);
    const malformed1024 = Buffer.from(empty);
    malformed1024.writeUInt32BE(1024, offset);
    // Count 1024 is registered, but it cannot fabricate 1024 missing rows.
    expect(() => decodeU2StateGroup(5, malformed1024)).toThrow();
  });

  it("keeps the proof exactly 18 fields with no fabricated nineteenth key epoch", () => {
    const bytes = encodeVap1Proof(proof);
    expect(decodeVap1Frame(bytes).fields).toHaveLength(18);
    expect(decodeVap1Proof(bytes)).toEqual(proof);
    const fields = decodeVap1Frame(bytes).fields;
    expect(() => decodeVap1Proof(encodeVap1Frame(2, [
      ...fields, { id: 19, type: "u64", value: 1n },
    ]))).toThrow(/18-field/);
  });

  it("rejects syntactically invalid audience/purpose and ANONYMOUS fake-session fields", () => {
    for (const invalidAudience of ["", "tenant with space", "tenant\ninjected"]) {
      expect(() => encodeVap1Proof({
        ...proof, audience: invalidAudience,
      })).toThrow();
    }
    expect(() => encodeVap1Proof({ ...proof, purpose: "LOGIN / FAKE" })).toThrow();
    for (const invalid of [
      { actorSessionId: LIMITER },
      { actorUserId: USER },
    ]) {
      expect(() => encodeVap1Proof({ ...proof, ...invalid })).toThrow();
    }
    // A syntactically valid but incorrect tenant/purpose can be *encoded* by
    // this public codec. No password, bearer or signer exists in this module:
    // encodability is deliberately NOT authentication or issuer authority.
    const otherAudience = encodeVap1Proof({ ...proof, audience: "other-tenant" });
    const otherPurpose = encodeVap1Proof({
      ...proof, purpose: "STAFF_REFRESH_ROTATE_OR_REPLAY_REVOKE",
    });
    expect(decodeVap1Proof(otherAudience).audience).toBe("other-tenant");
    expect(decodeVap1Proof(otherPurpose).purpose).not.toBe("STAFF_LOGIN_COMMIT");
    expect(createHash("sha256").update(otherAudience).digest()).not.toEqual(
      createHash("sha256").update(encodeVap1Proof(proof)).digest(),
    );
  });
});
