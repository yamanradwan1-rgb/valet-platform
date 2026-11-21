import { describe, expect, it } from "vitest";

import { staffCredentialHash } from "../src/modules/auth/staff-auth-credential";
import {
  encodeU2StateRow, encodeU2StateGroup, decodeU2StateGroup,
  encodeU2StateFrame, decodeU2StateFrame,
} from "../src/modules/auth/vap1-typed/u2-state";
import { U2_STATE_GROUPS } from "../src/modules/auth/vap1-typed/u2-state-schema";
import { encodeU2StaffLoginPayload, decodeU2StaffLoginPayload } from
  "../src/modules/auth/vap1-typed/u2-staff-login";
import { type Vap1Field } from "../src/modules/auth/vap1/vap1-wire";

const A = "00000000-0000-0000-0000-000000000001";
const B = "00000000-0000-0000-0000-000000000002";
const C = "00000000-0000-0000-0000-000000000003";
const ADMISSION_KINDS = [
  "USER", "ORGANIZATION", "ENTITLEMENT", "MEMBERSHIP", "LOCATION", "GRANT",
  "SESSION", "REFRESH", "FACTOR", "RECOVERY_SET", "INVITATION",
  "PASSWORD_RESET", "PUSH_REGISTRATION",
] as const;

function key(id: string, prefix = 1): Buffer {
  return Buffer.concat([
    Buffer.from([prefix]),
    Buffer.from(id.replaceAll("-", ""), "hex"),
  ]);
}

function grantKey(org: string, membership: string, location: string): Buffer {
  return Buffer.concat([
    Buffer.from([2]),
    Buffer.from(org.replaceAll("-", ""), "hex"),
    Buffer.from(membership.replaceAll("-", ""), "hex"),
    Buffer.from(location.replaceAll("-", ""), "hex"),
  ]);
}

function admission(
  kind: string, objectKey = kind === "GRANT" ? grantKey(A, B, C) : key(A),
  parentKey: Buffer | null = null,
): readonly Vap1Field[] {
  return [
    { id: 1, type: "utf8", value: "test" },
    { id: 2, type: "utf8", value: kind },
    { id: 3, type: "bytes", value: objectKey },
    { id: 4, type: "utf8", value: "ADMIT" },
    { id: 5, type: "u64", value: 1n },
    { id: 6, type: "u64", value: 7n },
    { id: 7, type: "sha256", value: Buffer.alloc(32, 0x11) },
    parentKey === null ?
      { id: 8, type: "null", value: null } :
      { id: 8, type: "bytes", value: parentKey },
  ];
}

function inviteRow(kind: string): readonly Vap1Field[] {
  return [
    { id: 1, type: "uuid", value: A },
    { id: 2, type: "uuid", value: B },
    { id: 3, type: "utf8", value: kind },
    { id: 4, type: "u64", value: 1n },
    { id: 5, type: "sha256", value: Buffer.alloc(32, 0x23) },
    { id: 6, type: "u64", value: 1_700_000_000_000_001n },
    { id: 7, type: "null", value: null },
    { id: 8, type: "null", value: null },
  ];
}

describe("U2 group0005 admission registry — W2 migration113", () => {
  it("matches exactly thirteen private CHECK literals and round-trips each", () => {
    expect(U2_STATE_GROUPS[5]?.attributes[1]?.enumLabels).toEqual(ADMISSION_KINDS);
    for (const kind of ADMISSION_KINDS) {
      const row = admission(kind);
      const bytes = encodeU2StateRow(5, row);
      expect(bytes.readUInt16BE(0)).toBe(1);
      expect(bytes.readUInt16BE(2)).toBe(8);
      const group = encodeU2StateGroup(5, [row]);
      expect(decodeU2StateGroup(5, group)).toEqual([row]);
      const state = encodeU2StateFrame({
        operationId: A,
        purpose: "STAFF_LOGIN_COMMIT",
        keyPromotionEpoch: 7n,
        groups: { 5: [row] },
      });
      expect(decodeU2StateFrame(state).groups[5]).toEqual([row]);
    }
  });

  it("rejects unregistered/case-changed kinds and non-UTF8 kind values", () => {
    for (const invalid of ["CUSTOM", "GRANTS", "user", "STAFF_INVITATION", "", "GRANT "]) {
      expect(() => encodeU2StateRow(5, admission(invalid))).toThrow();
    }
    const mutated = [...admission("USER")];
    mutated[1] = { id: 2, type: "null", value: null };
    expect(() => encodeU2StateRow(5, mutated)).toThrow();
    const group = encodeU2StateGroup(5, [admission("USER")]);
    const tampered = Buffer.from(group);
    const kindOffset = tampered.indexOf(Buffer.from("USER", "ascii"));
    expect(kindOffset).toBeGreaterThan(-1);
    tampered.write("FAKE", kindOffset, "ascii");
    expect(() => decodeU2StateGroup(5, tampered)).toThrow();
  });

  it("requires GRANT=0x02+48 bytes; all twelve singleton kinds=0x01+16 bytes", () => {
    expect(grantKey(A, B, C).length).toBe(49);
    expect(key(A).length).toBe(17);
    for (const kind of ADMISSION_KINDS) {
      if (kind === "GRANT") {
        expect(() => encodeU2StateRow(5, admission(kind, key(A)))).toThrow();
      } else {
        expect(() => encodeU2StateRow(5, admission(kind, grantKey(A, B, C)))).toThrow();
      }
    }
    for (const malformed of [
      Buffer.concat([Buffer.from([1]), Buffer.alloc(48)]),
      Buffer.concat([Buffer.from([2]), Buffer.alloc(16)]),
      Buffer.from([1]),
      Buffer.concat([Buffer.from([3]), Buffer.alloc(16)]),
      Buffer.concat([Buffer.from([2]), Buffer.alloc(49)]),
    ]) {
      expect(() => encodeU2StateRow(5, admission("GRANT", malformed))).toThrow();
      expect(() => encodeU2StateRow(5, admission("USER", malformed))).toThrow();
      expect(() => encodeU2StateRow(5, admission("USER", key(A), malformed))).toThrow();
    }
    expect(() => encodeU2StateRow(5, admission("GRANT", grantKey(A, B, C), key(A))))
      .not.toThrow();
  });

  it("sorts lexically by audience/kind/UUID network bytes; rejects duplicates/reordering", () => {
    const sorted = [...ADMISSION_KINDS].sort().map((kind) => admission(kind));
    expect(decodeU2StateGroup(5, encodeU2StateGroup(5, sorted))).toEqual(sorted);
    expect(() => encodeU2StateGroup(5, [...sorted].reverse())).toThrow();
    expect(() => encodeU2StateGroup(5, [admission("USER"), admission("USER")]))
      .toThrow();
    const ascending = [admission("USER", key(A)), admission("USER", key(B))];
    expect(() => encodeU2StateGroup(5, ascending)).not.toThrow();
    expect(() => encodeU2StateGroup(5, [...ascending].reverse())).toThrow();
    const keys = [
      admission("GRANT", grantKey(A, B, A)),
      admission("GRANT", grantKey(A, B, C)),
    ];
    expect(() => encodeU2StateGroup(5, keys)).not.toThrow();
    expect(() => encodeU2StateGroup(5, [...keys].reverse())).toThrow();
  });

  it("keeps unregistered group0016 credential-kind categories closed", () => {
    expect(U2_STATE_GROUPS[16]?.attributes[2]?.enumLabels).toEqual([]);
    for (const value of ["STAFF_INVITATION", "STAFF_PASSWORD_RESET"]) {
      expect(() => encodeU2StateRow(16, inviteRow(value))).toThrow();
    }
    expect(() => encodeU2StateGroup(16, [])).not.toThrow();
  });

  it("A01 stored hashes match the actual staffCredentialHash access/refresh prefixes", () => {
    const accessHash = staffCredentialHash("access", "vsa1." + "A".repeat(43));
    const refreshHash = staffCredentialHash("refresh", "vsr1." + "B".repeat(43));
    expect(accessHash).toMatch(/^staff-access-sha256:v1:[0-9a-f]{64}$/);
    expect(refreshHash).toMatch(/^staff-refresh-sha256:v1:[0-9a-f]{64}$/);
    const payload = {
      operationId: A,
      userId: B,
      verifiedPasswordDigest: Buffer.alloc(32, 0x44),
      newSessionId: C,
      newRefreshId: A,
      newAccessHash: accessHash,
      newRefreshHash: refreshHash,
      limiterReservationId: B,
    };
    expect(decodeU2StaffLoginPayload(encodeU2StaffLoginPayload(payload)))
      .toEqual(payload);
    expect(() => encodeU2StaffLoginPayload({
      ...payload, newAccessHash: refreshHash,
    })).toThrow();
  });
});
