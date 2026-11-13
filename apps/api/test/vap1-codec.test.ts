import { createHash, createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  decodeVap1Frame, encodeVap1Frame, vap1U64,
} from "../src/modules/auth/vap1/vap1-wire";
import {
  decodeVap1Proof, encodeVap1Proof, vap1FrameDigest,
  type Vap1ProofFields,
} from "../src/modules/auth/vap1/vap1-proof";

const KEY = Buffer.from(Array.from({ length: 32 }, (_, index) => index));
const PAYLOAD_SHA =
  "f7461d21c52f716334a63b35ea279fb307821531c5978eba3d024aed736d159c";
const UUID1 = "00000000-0000-0000-0000-000000000001";
const UUID2 = "00000000-0000-0000-0000-000000000002";
const payloadPrimitive = [
  { id: 1, type: "utf8" as const, value: "LOGIN" },
];
const testProof: Vap1ProofFields = {
  keyId: "k1",
  audience: "test",
  purpose: "LOGIN",
  operationId: UUID1,
  challengeNonce: Buffer.alloc(32, 0xa5),
  backendPid: 1234,
  fullXid: 4294967297n,
  actorKind: "ANONYMOUS",
  actorUserId: null,
  actorSessionId: null,
  organizationId: null,
  membershipId: null,
  subjectUserId: UUID2,
  stateDigest: Buffer.alloc(32, 0x11),
  payloadDigest: Buffer.from(PAYLOAD_SHA, "hex"),
  issuedAtMs: 1700000000000n,
  expiresAtMs: 1700000030000n,
};

describe("VAP1 exact binary TLV — independent S1 reference vectors", () => {
  it("matches S1 payload frame, SHA256 and proof primitive HMAC", () => {
    const payload = encodeVap1Frame(0x01, payloadPrimitive);
    expect(payload.toString("hex")).toBe(
      "5641594c45542f56415031000100010001000104000000054c4f47494e",
    );
    expect(vap1FrameDigest(0x01, payloadPrimitive).toString("hex")).toBe(PAYLOAD_SHA);
    const primitive = encodeVap1Frame(0x02, [
      { id: 1, type: "utf8", value: "vap1" },
    ]);
    expect(primitive.toString("hex")).toBe(
      "5641594c45542f564150310002000100010001040000000476617031",
    );
    expect(createHash("sha256").update(primitive).digest("hex")).toBe(
      "bb401a644eefdf8795b6d1ee56bb2cfc2410da770b12f70547aa5113f00a140e",
    );
    expect(createHmac("sha256", KEY).update(primitive).digest("hex")).toBe(
      "b852ab32befc2a3781a12f0f1d5422763276e9454d839e6778313e38ef5ddc28",
    );
  });

  it("matches S1 complete 18-field / 323-byte golden proof, SHA256 and HMAC", () => {
    const bytes = encodeVap1Proof(testProof);
    expect(bytes.length).toBe(323);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "9207707792636b1fca6f07b7ea0df1e0b39e0f04087c470701a1c0261de8fa29",
    );
    expect(createHmac("sha256", KEY).update(bytes).digest("hex")).toBe(
      "2b0da4ae9b1dc22e10bedc1e1c0a31fe1f2c339273f49092116eaa26d4799fbb",
    );
    expect(decodeVap1Proof(bytes)).toEqual(testProof);
    expect(decodeVap1Frame(bytes).fields).toHaveLength(18);
  });

  it("rejects bad field order, duplicates, type, malformed lengths and trailing bytes", () => {
    const payload = encodeVap1Frame(1, payloadPrimitive);
    expect(() => encodeVap1Frame(1, [
      { id: 2, type: "null", value: null },
      { id: 1, type: "null", value: null },
    ])).toThrow();
    expect(() => encodeVap1Frame(1, [
      { id: 1, type: "null", value: null },
      { id: 1, type: "null", value: null },
    ])).toThrow();
    expect(() => decodeVap1Frame(Buffer.concat([payload, Buffer.from([0])]))).toThrow();
    for (const [offset, replacement] of ([
      [12, 0x04], // unsupported kind
      [14, 0x02], // schema version 2
      [16, 0x02], // field count 2, but one present
      [19, 0xff], // unsupported wire type
      [20, 0xff], // oversized field length
    ] as const)) {
      const changed = Buffer.from(payload);
      changed[offset] = replacement;
      expect(() => decodeVap1Frame(changed)).toThrow();
    }
    expect(() => decodeVap1Frame(payload.subarray(0, payload.length - 1))).toThrow();
  });

  it("rejects noncanonical Unicode, UUID, boolean, SHA and numeric representations", () => {
    expect(() => encodeVap1Frame(1, [
      { id: 1, type: "utf8", value: "\ud800" },
    ])).toThrow();
    expect(() => encodeVap1Frame(1, [
      { id: 1, type: "utf8", value: "\ufeffpayload" },
    ])).toThrow();
    expect(() => encodeVap1Frame(1, [
      { id: 1, type: "uuid", value: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" },
    ])).toThrow();
    expect(() => encodeVap1Frame(1, [
      { id: 1, type: "sha256", value: Buffer.alloc(31) },
    ])).toThrow();
    expect(() => encodeVap1Frame(1, [
      { id: 1, type: "u64", value: 4294967297 as unknown as bigint },
    ])).toThrow();
    expect(() => vap1U64("0001")).toThrow();
    expect(() => vap1U64(-1n)).toThrow();
    expect(() => vap1U64(1n << 64n)).toThrow();
    const invalidBool = encodeVap1Frame(1, [
      { id: 1, type: "bool", value: true },
    ]);
    invalidBool[invalidBool.length - 1] = 2;
    expect(() => decodeVap1Frame(invalidBool)).toThrow();
    const invalidUtf8 = encodeVap1Frame(3, [
      { id: 1, type: "utf8", value: "a" },
    ]);
    invalidUtf8[invalidUtf8.length - 1] = 0xff;
    expect(() => decodeVap1Frame(invalidUtf8)).toThrow();
    const exactLargeXid = 9007199254740993n;
    const large = encodeVap1Frame(3, [
      { id: 1, type: "u64", value: exactLargeXid },
    ]);
    expect(decodeVap1Frame(large).fields).toEqual([
      { id: 1, type: "u64", value: exactLargeXid },
    ]);
  });

  it("rejects inauthentic proof field identities, key epoch surrogates and expiry", () => {
    expect(() => encodeVap1Proof({ ...testProof, expiresAtMs: 1700000030001n }))
      .toThrow();
    expect(() => encodeVap1Proof({ ...testProof, challengeNonce: Buffer.alloc(31) }))
      .toThrow();
    expect(() => encodeVap1Proof({ ...testProof, actorKind: "STAFF" }))
      .toThrow();
    expect(() => encodeVap1Proof({ ...testProof, fullXid: 0n }))
      .toThrow();
    expect(() => encodeVap1Proof({ ...testProof, keyId: "evil\nkey" }))
      .toThrow();
    const encoded = encodeVap1Proof(testProof);
    const wrongFieldCount = Buffer.from(encoded);
    wrongFieldCount.writeUInt16BE(17, 15);
    expect(() => decodeVap1Proof(wrongFieldCount)).toThrow();
    const nullNonce = Buffer.from(encoded);
    // The first field is UTF8("vap1"): 7-byte TLV header + 4 bytes.
    // The second field begins at offset 17 + 11 and must keep its exact type.
    nullNonce[28 + 2] = 0;
    expect(() => decodeVap1Proof(nullNonce)).toThrow();
    const staff = {
      ...testProof,
      purpose: "STAFF_LOGIN_COMMIT",
      actorKind: "STAFF" as const,
      actorUserId: UUID1,
      actorSessionId: UUID2,
      subjectUserId: null,
    };
    expect(decodeVap1Proof(encodeVap1Proof(staff))).toEqual(staff);
    const original = createHmac("sha256", KEY).update(encoded).digest("hex");
    for (const mutated of [
      { ...testProof, audience: "different" },
      { ...testProof, purpose: "STAFF_LOGIN_COMMIT" },
      { ...testProof, fullXid: testProof.fullXid + 1n },
      { ...testProof, backendPid: 1235 },
      { ...testProof, stateDigest: Buffer.alloc(32, 0x12) },
      { ...testProof, payloadDigest: Buffer.alloc(32, 0x12) },
    ]) {
      expect(createHmac("sha256", KEY).update(encodeVap1Proof(mutated))
        .digest("hex")).not.toBe(original);
    }
  });

  it("matches migration113 keyId, audience and purpose syntax at exact boundaries", () => {
    for (const keyId of ["A", "Z" + "9._:-".repeat(12) + "123", "k1._:-"]) {
      expect(() => encodeVap1Proof({ ...testProof, keyId })).not.toThrow();
    }
    expect(("Z" + "9._:-".repeat(12) + "123").length).toBe(64);
    for (const audience of ["0", "A" + "9._:-".repeat(19), "test.env:stage-1"]) {
      expect(() => encodeVap1Proof({ ...testProof, audience })).not.toThrow();
    }
    expect(("A" + "9._:-".repeat(19)).length).toBe(96);
    for (const purpose of ["ABC", "LOGIN", "STAFF_LOGIN_COMMIT", "A" + "B_".repeat(47) + "C"]) {
      expect(() => encodeVap1Proof({ ...testProof, purpose })).not.toThrow();
    }
    expect(("A" + "B_".repeat(47) + "C").length).toBe(96);
  });

  it("rejects SQL-invalid field-specific identifiers on encode and decode", () => {
    const invalid = [
      { id: 2, values: ["", "0key", "_key", "k/name", "k key", "A".repeat(65), "abc\n"] },
      { id: 3, values: ["", "_aud", "a/b", "a b", "a".repeat(97), "aud\n"] },
      { id: 4, values: ["", "AB", "2ABC", "staff_login_commit", "A/B", "A-B",
        "A.B", "A".repeat(97), "LOGIN\n"] },
    ] as const;
    for (const { id, values } of invalid) {
      for (const value of values) {
        const altered = {
          ...testProof,
          ...(id === 2 ? { keyId: value } : id === 3 ? { audience: value } :
            { purpose: value }),
        };
        expect(() => encodeVap1Proof(altered)).toThrow();
        // A generic TLV frame may be syntactically valid yet NOT a valid proof.
        const frame = decodeVap1Frame(encodeVap1Proof(testProof));
        const malicious = encodeVap1Frame(2, frame.fields.map((field) =>
          field.id === id && field.type === "utf8" ? { ...field, value } : field,
        ));
        expect(() => decodeVap1Proof(malicious)).toThrow();
      }
    }
  });

  it("does not elevate syntactically valid illustrative purposes into a signer", () => {
    // LOGIN is S1's fixed syntactic vector but is not a registered A01 signer.
    // No callable signer/key loader is exported by this codec-only module.
    expect(decodeVap1Proof(encodeVap1Proof(testProof)).purpose).toBe("LOGIN");
    expect(decodeVap1Proof(encodeVap1Proof({
      ...testProof, purpose: "SYNTHETIC_TEST_PURPOSE",
    })).purpose).toBe("SYNTHETIC_TEST_PURPOSE");
  });
});
