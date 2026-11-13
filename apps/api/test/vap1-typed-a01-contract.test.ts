import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { assertU2A01FramePair } from
  "../src/modules/auth/vap1-typed/u2-a01-contract";
import { encodeU2StaffLoginPayload } from
  "../src/modules/auth/vap1-typed/u2-staff-login";
import { u2PrefixDigest } from "../src/modules/auth/vap1-typed/u2-record";
import {
  encodeU2StateFrame, type U2StateGroup,
} from "../src/modules/auth/vap1-typed/u2-state";
import { type Vap1Field } from "../src/modules/auth/vap1/vap1-wire";

const OP = "00000000-0000-0000-0000-000000000001";
const USER = "00000000-0000-0000-0000-000000000002";
const SESSION = "00000000-0000-0000-0000-000000000003";
const REFRESH = "00000000-0000-0000-0000-000000000004";
const LIMITER = "00000000-0000-0000-0000-000000000005";
const PHC = "$argon2id$v=19$m=65536,t=3,p=4$synthetic-only";
const phcDigest = createHash("sha256").update(PHC, "utf8").digest();
const noopDigest = Buffer.alloc(32, 0x21);

const payload = {
  operationId: OP, userId: USER,
  verifiedPasswordDigest: phcDigest,
  newSessionId: SESSION, newRefreshId: REFRESH,
  newAccessHash: "staff-access-sha256:v1:" + "a".repeat(64),
  newRefreshHash: "staff-refresh-sha256:v1:" + "b".repeat(64),
  limiterReservationId: LIMITER,
} as const;

function userRow(): Vap1Field[] {
  const prefix: Vap1Field[] = [
    { id: 1, type: "uuid", value: USER },
    { id: 2, type: "utf8", value: "staff@example.org" },
    { id: 3, type: "utf8", value: "ACTIVE" },
    { id: 4, type: "sha256", value: phcDigest },
  ];
  return [
    ...prefix,
    { id: 5, type: "sha256", value: u2PrefixDigest(prefix) },
  ];
}

function userKey(): Buffer {
  return Buffer.concat([
    Buffer.from([1]), Buffer.from(USER.replaceAll("-", ""), "hex"),
  ]);
}

function admission(userDigest: Buffer): Vap1Field[] {
  return [
    { id: 1, type: "utf8", value: "synthetic-audience" },
    { id: 2, type: "utf8", value: "USER" },
    { id: 3, type: "bytes", value: userKey() },
    { id: 4, type: "utf8", value: "ADMIT" },
    { id: 5, type: "u64", value: 1n },
    { id: 6, type: "u64", value: 1n },
    { id: 7, type: "sha256", value: userDigest },
    { id: 8, type: "null", value: null },
  ];
}

function limiter(): Vap1Field[] {
  return [
    { id: 1, type: "uuid", value: LIMITER },
    { id: 2, type: "utf8", value: "v1:staff-login-identifier" },
    { id: 3, type: "sha256", value: noopDigest },
    { id: 4, type: "utf8", value: "PENDING" },
    { id: 5, type: "uuid", value: OP },
  ];
}

interface Fixture {
  operationId: string;
  groups: Partial<Record<U2StateGroup, readonly (readonly Vap1Field[])[]>>;
}

function fixture(): Fixture {
  const user = userRow();
  const digestField = user[4];
  if (digestField?.type !== "sha256") throw new Error("fixture digest missing");
  return {
    operationId: OP,
    groups: {
      5: [admission(digestField.value)], 6: [user], 19: [limiter()],
    },
  };
}

function encodeState(input: Fixture): Buffer {
  return encodeU2StateFrame({
    operationId: input.operationId,
    purpose: "STAFF_LOGIN_COMMIT",
    keyPromotionEpoch: 1n,
    groups: input.groups,
  });
}

function mutate(
  input: Fixture, group: 5 | 6 | 19, index: number, replacement: Vap1Field,
): void {
  const rows = input.groups[group];
  if (!rows?.[0]) throw new Error("fixture missing group");
  const row = [...rows[0]];
  row[index] = replacement;
  input.groups[group] = [row];
}

describe("W2 118/119 A01 locked state and payload pair structure", () => {
  it("accepts exact SQL A01 topology and matching U/ADMIT/limiter bindings", () => {
    const state = encodeState(fixture());
    const command = encodeU2StaffLoginPayload(payload);
    expect(() => assertU2A01FramePair(command, state)).not.toThrow();
  });

  it("rejects omitted/extra A01 rows while generic typed codec remains reusable", () => {
    for (const invalidGroup of [5, 6, 19] as const) {
      const changed = fixture();
      changed.groups[invalidGroup] = [];
      expect(() => assertU2A01FramePair(
        encodeU2StaffLoginPayload(payload), encodeState(changed),
      )).toThrow(/topology/);
    }
    const changed = fixture();
    changed.groups[7] = [[
      { id: 1, type: "uuid", value: OP },
      { id: 2, type: "utf8", value: "ACTIVE" },
      { id: 3, type: "sha256", value: u2PrefixDigest([
        { id: 1, type: "uuid", value: OP },
        { id: 2, type: "utf8", value: "ACTIVE" },
      ]) },
    ]];
    expect(() => assertU2A01FramePair(
      encodeU2StaffLoginPayload(payload), encodeState(changed),
    )).toThrow(/topology/);
  });

  it("rejects cross-frame operation and PHC mismatch", () => {
    const changed = fixture();
    changed.operationId = SESSION;
    expect(() => assertU2A01FramePair(
      encodeU2StaffLoginPayload(payload), encodeState(changed),
    )).toThrow(/operation/);
    const stale = fixture();
    // Independent row prefix commitment must remain internally valid.
    const prefix = [...(stale.groups[6]?.[0] ?? [])].slice(0, 4);
    prefix[3] = { id: 4, type: "sha256", value: noopDigest };
    stale.groups[6] = [[
      ...prefix, { id: 5, type: "sha256", value: u2PrefixDigest(prefix) },
    ]];
    const userDigest = u2PrefixDigest(prefix);
    mutate(stale, 5, 6, { id: 7, type: "sha256", value: userDigest });
    expect(() => assertU2A01FramePair(
      encodeU2StaffLoginPayload(payload), encodeState(stale),
    )).toThrow(/PHC/);
  });

  it("rejects wrong ADMIT kind, key, disposition, version, parent and user digest", () => {
    const cases: readonly [number, Vap1Field][] = [
      [1, { id: 2, type: "utf8", value: "SESSION" }],
      [2, { id: 3, type: "bytes", value: Buffer.concat([
        Buffer.from([1]), Buffer.from(OP.replaceAll("-", ""), "hex"),
      ]) }],
      [3, { id: 4, type: "utf8", value: "HOLD" }],
      [4, { id: 5, type: "u64", value: 0n }],
      [6, { id: 7, type: "sha256", value: noopDigest }],
      [7, { id: 8, type: "bytes", value: userKey() }],
    ];
    for (const [index, field] of cases) {
      const changed = fixture();
      mutate(changed, 5, index, field);
      expect(() => assertU2A01FramePair(
        encodeU2StaffLoginPayload(payload), encodeState(changed),
      )).toThrow();
    }
  });

  it("rejects mismatched limiter ID/scope/state/operation", () => {
    const cases: readonly [number, Vap1Field][] = [
      [0, { id: 1, type: "uuid", value: SESSION }],
      [1, { id: 2, type: "utf8", value: "v1:staff-client-address" }],
      [3, { id: 4, type: "utf8", value: "COUNTED" }],
      [4, { id: 5, type: "uuid", value: SESSION }],
    ];
    for (const [index, field] of cases) {
      const changed = fixture();
      mutate(changed, 19, index, field);
      expect(() => assertU2A01FramePair(
        encodeU2StaffLoginPayload(payload), encodeState(changed),
      )).toThrow();
    }
  });
});
