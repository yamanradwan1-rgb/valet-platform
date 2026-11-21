import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { decodeVap1Frame, encodeVap1Frame, type Vap1Field } from
  "../src/modules/auth/vap1/vap1-wire";
import {
  decodeU2StateFrame, decodeU2StateGroup, encodeU2StateFrame,
  encodeU2StateGroup, encodeU2StateRow, u2StateDigest,
} from "../src/modules/auth/vap1-typed/u2-state";
import { u2PrefixDigest } from "../src/modules/auth/vap1-typed/u2-record";
import {
  decodeU2StaffLoginPayload, encodeU2StaffLoginPayload, u2StaffLoginPayloadDigest,
} from "../src/modules/auth/vap1-typed/u2-staff-login";

const A = "00000000-0000-0000-0000-000000000001";
const B = "00000000-0000-0000-0000-000000000002";
const C = "00000000-0000-0000-0000-000000000003";
const D = "00000000-0000-0000-0000-000000000004";
const E = "00000000-0000-0000-0000-000000000005";
const phc = "$argon2id$v=19$m=19456,t=2,p=1$fixture";
const passwordDigest = createHash("sha256").update(phc).digest();

const login = {
  operationId: A,
  userId: B,
  verifiedPasswordDigest: passwordDigest,
  newSessionId: C,
  newRefreshId: D,
  newAccessHash: "staff-access-sha256:v1:" + "a".repeat(64),
  newRefreshHash: "staff-refresh-sha256:v1:" + "b".repeat(64),
  limiterReservationId: E,
} as const;

function userRow(userId = B): readonly Vap1Field[] {
  const prefix: Vap1Field[] = [
    { id: 1, type: "uuid", value: userId },
    { id: 2, type: "utf8", value: "guest@example.org" },
    { id: 3, type: "utf8", value: "ACTIVE" },
    { id: 4, type: "sha256", value: passwordDigest },
  ];
  return [...prefix, { id: 5, type: "sha256", value: u2PrefixDigest(prefix) }];
}

function limiterRow(): readonly Vap1Field[] {
  return [
    { id: 1, type: "uuid", value: E },
    { id: 2, type: "utf8", value: "v1:staff-login-identifier" },
    { id: 3, type: "sha256", value: Buffer.alloc(32, 0xab) },
    { id: 4, type: "utf8", value: "PENDING" },
    { id: 5, type: "uuid", value: A },
  ];
}

describe("U2 kind03 fixed state registry and exact A01 payload", () => {
  it("emits every 0001..0020 field and sixteen correctly tagged group arrays", () => {
    const state = {
      operationId: A,
      purpose: "STAFF_LOGIN_COMMIT" as const,
      keyPromotionEpoch: 4_294_967_297n,
      groups: { 6: [userRow()], 19: [limiterRow()] },
    };
    const bytes = encodeU2StateFrame(state);
    expect(bytes.length).toBe(890);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "fb0f05c1a86822b1be4d3edba6914ad3c5ce3e285e64f090a43350c53a1ace69",
    );
    const frame = decodeVap1Frame(bytes);
    expect(frame.kind).toBe(3);
    expect(frame.fields.map((field) => field.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    for (let id = 5; id <= 20; id += 1) {
      const field = frame.fields[id - 1];
      if (!field || field.type !== "bytes") throw new Error("unexpected state type");
      expect(field.type).toBe("bytes");
      expect(field.value.readUInt8(Buffer.byteLength("VAYLET/VAP1/ARRAY\0") + 2))
        .toBe(id + 0x0b);
      expect(field.value.readUInt32BE(Buffer.byteLength("VAYLET/VAP1/ARRAY\0") + 3))
        .toBe(id === 6 || id === 19 ? 1 : 0);
    }
    expect(decodeU2StateFrame(bytes).groups[6]).toEqual([userRow()]);
    expect(decodeU2StateFrame(bytes).groups[19]).toEqual([limiterRow()]);
    expect(u2StateDigest(state)).toEqual(createHash("sha256").update(bytes).digest());
    expect(decodeU2StateFrame(bytes).keyPromotionEpoch).toBe(4_294_967_297n);
  });

  it("requires typed sorted row keys, exact digest and no forged classifications", () => {
    const valid = encodeU2StateRow(6, userRow());
    expect(valid.readUInt16BE(0)).toBe(1);
    expect(valid.readUInt16BE(2)).toBe(5);
    expect(() => encodeU2StateGroup(6, [userRow(B), userRow(A)])).toThrow();
    expect(() => encodeU2StateGroup(6, [userRow(B), userRow(B)])).toThrow();
    const damaged = userRow().map((f) => ({ ...f })) as Vap1Field[];
    damaged[4] = { id: 5, type: "sha256", value: Buffer.alloc(32) };
    expect(() => encodeU2StateRow(6, damaged)).toThrow();
    damaged[4] = { id: 5, type: "null", value: null };
    expect(() => encodeU2StateRow(6, damaged)).toThrow();
    const unknownAdmission: Vap1Field[] = [
      { id: 1, type: "utf8", value: "test" },
      { id: 2, type: "utf8", value: "UNKNOWN_OBJECT_KIND" },
      { id: 3, type: "bytes", value: Buffer.concat([Buffer.from([1]), Buffer.alloc(16)]) },
      { id: 4, type: "utf8", value: "ADMIT" },
      { id: 5, type: "u64", value: 1n },
      { id: 6, type: "u64", value: 1n },
      { id: 7, type: "sha256", value: Buffer.alloc(32) },
      { id: 8, type: "null", value: null },
    ];
    expect(() => encodeU2StateRow(5, unknownAdmission)).toThrow();
  });

  it("rejects altered group kind/schema/row element type/trailing byte", () => {
    const base = encodeU2StateGroup(6, [userRow()]);
    expect(decodeU2StateGroup(6, base)).toEqual([userRow()]);
    const header = Buffer.byteLength("VAYLET/VAP1/ARRAY\0");
    for (const [position, byte] of [
      [header, 2], // v2
      [header + 2, 0x1f], // wrong row class
      [header + 3, 0xff], // inflated count
      [header + 7, 5], // expected row BYTES
      [header + 8, 0xff], // row length overflow
    ] as const) {
      const changed = Buffer.from(base);
      changed[position] = byte;
      expect(() => decodeU2StateGroup(6, changed)).toThrow();
    }
    expect(() => decodeU2StateGroup(6, Buffer.concat([base, Buffer.from([0])])))
      .toThrow();
    expect(() => encodeU2StateFrame({
      operationId: A, purpose: "STAFF_LOGIN_COMMIT", keyPromotionEpoch: 1n,
      groups: { 21: [] } as never,
    })).toThrow();
    expect(() => encodeU2StateFrame({
      operationId: A, purpose: "STAFF_LOGIN_COMMIT", keyPromotionEpoch: 0n,
      groups: {},
    })).toThrow();
  });

  it("encodes purpose STAFF_LOGIN_COMMIT, schema and all seven A01 arguments in U2 order", () => {
    const bytes = encodeU2StaffLoginPayload(login);
    expect(bytes.length).toBe(396);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "7617485d8d58cb794ecc03f936333321e1bc7b5e071418d9f493e69bb8775b77",
    );
    const frame = decodeVap1Frame(bytes);
    expect(frame.kind).toBe(1);
    expect(frame.fields.map((field) => field.id))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(frame.fields[2]).toEqual({
      id: 3, type: "utf8", value: "STAFF_LOGIN_COMMIT",
    });
    expect(decodeU2StaffLoginPayload(bytes)).toEqual(login);
    expect(u2StaffLoginPayloadDigest(login)).toEqual(
      createHash("sha256").update(bytes).digest(),
    );
    expect(() => encodeU2StaffLoginPayload({
      ...login, newAccessHash: "staff-refresh-sha256:v1:" + "a".repeat(64),
    })).toThrow();
    expect(() => encodeU2StaffLoginPayload({
      ...login, verifiedPasswordDigest: Buffer.alloc(31),
    })).toThrow();
  });

  it("rejects A01 wrong case, missing/extra/retyped fields, schema and trailing bytes", () => {
    const bytes = encodeU2StaffLoginPayload(login);
    const fields = [...decodeVap1Frame(bytes).fields];
    const wrongCase = [...fields];
    wrongCase[2] = { id: 3, type: "utf8", value: "staff_login_commit" };
    expect(() => decodeU2StaffLoginPayload(encodeVap1Frame(1, wrongCase))).toThrow();
    const wrongType = [...fields];
    wrongType[4] = { id: 5, type: "bytes", value: passwordDigest };
    expect(() => decodeU2StaffLoginPayload(encodeVap1Frame(1, wrongType))).toThrow();
    expect(() => decodeU2StaffLoginPayload(encodeVap1Frame(1, fields.slice(0, 9))))
      .toThrow();
    expect(() => decodeU2StaffLoginPayload(encodeVap1Frame(1, [
      ...fields, { id: 11, type: "null", value: null },
    ]))).toThrow();
    expect(() => decodeU2StaffLoginPayload(encodeVap1Frame(1, [
      { id: 1, type: "u32", value: 2 }, ...fields.slice(1),
    ]))).toThrow();
    expect(() => decodeU2StaffLoginPayload(Buffer.concat([bytes, Buffer.from([0])])))
      .toThrow();
    expect(() => decodeU2StaffLoginPayload(bytes.subarray(0, bytes.length - 1)))
      .toThrow();
  });
});
