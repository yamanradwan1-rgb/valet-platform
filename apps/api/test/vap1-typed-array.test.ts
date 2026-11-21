import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  encodeU2Array, encodeU2OperatingHours, U2_WEEKDAYS,
  type U2RecoveryEntry, type U2LimiterReservation,
} from "../src/modules/auth/vap1-typed/u2-array";
import { decodeU2Array } from "../src/modules/auth/vap1-typed/u2-array-decode";
import {
  decodeU2Record, encodeU2Record, u2LocalTimeMicros, u2TimestampMicros,
} from "../src/modules/auth/vap1-typed/u2-record";

const A = "00000000-0000-0000-0000-000000000001";
const B = "00000000-0000-0000-0000-000000000002";
const C = "00000000-0000-0000-0000-000000000003";
const requireHash = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");
const HOURS = {
  days: U2_WEEKDAYS,
  isClosed: [true, false, false, false, false, false, true],
  startMicros: [null, 0n, 1n, 1_000_000n, 7_200_000_000n, 10n, null],
  endMicros: [null, 1n, 2n, 2_000_000n, 9_000_000_000n, 100n, null],
} as const;

const CODES: U2RecoveryEntry[] = Array.from({ length: 10 }, (_, index) => ({
  id: "00000000-0000-0000-0000-" + (index + 1).toString(16).padStart(12, "0"),
  slot: index + 1,
  selector: Buffer.alloc(8, index).toString("base64url"),
  verifier: "mrv1." + Buffer.alloc(32, index).toString("base64url"),
}));
function codeAt(index: number): U2RecoveryEntry {
  const entry = CODES[index];
  if (!entry) throw new Error("missing recovery test entry");
  return entry;
}

describe("U2 §8.0a compound arrays 01..06", () => {
  it("canonical UUID network byte order and duplicate rejection", () => {
    const bytes = encodeU2Array({ kind: 1, values: [A, B, C] });
    expect(bytes.toString("hex")).toBe(
      "5641594c45542f564150312f41525241590000010100000003" +
      "050000001000000000000000000000000000000001" +
      "050000001000000000000000000000000000000002" +
      "050000001000000000000000000000000000000003",
    );
    expect(decodeU2Array(bytes, { kind: 1 })).toEqual({
      kind: 1, values: [A, B, C],
    });
    expect(() => encodeU2Array({ kind: 1, values: [B, A] })).toThrow();
    expect(() => encodeU2Array({ kind: 1, values: [A, A] })).toThrow();
    expect(() => encodeU2Array({ kind: 1, values: [A, "BAD"] })).toThrow();
    expect(() => encodeU2Array({ kind: 1, values: [A, null as never] })).toThrow();
    expect(() => decodeU2Array(bytes, { kind: 2 })).toThrow();
  });

  it("keeps literal midnight distinct from NULL and validates full seven-day alignment", () => {
    const [days, closed, starts, ends] = encodeU2OperatingHours(HOURS);
    expect(decodeU2Array(days, { kind: 3, expectedOrder: U2_WEEKDAYS })).toEqual({
      kind: 3, values: HOURS.days, expectedOrder: U2_WEEKDAYS,
    });
    expect(decodeU2Array(closed, { kind: 2 })).toEqual({
      kind: 2, values: HOURS.isClosed,
    });
    expect(decodeU2Array(starts, { kind: 4 })).toEqual({
      kind: 4, values: HOURS.startMicros,
    });
    expect(decodeU2Array(ends, { kind: 4 })).toEqual({
      kind: 4, values: HOURS.endMicros,
    });
    expect(starts.includes(Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(true);
    expect(() => encodeU2OperatingHours({ ...HOURS,
      days: ["TUESDAY", "MONDAY", ...U2_WEEKDAYS.slice(2)],
    })).toThrow();
    expect(() => encodeU2OperatingHours({ ...HOURS,
      startMicros: [null, null, ...HOURS.startMicros.slice(2)],
    })).toThrow();
    expect(() => encodeU2OperatingHours({ ...HOURS,
      endMicros: [null, 0n, ...HOURS.endMicros.slice(2)],
    })).toThrow();
    expect(() => encodeU2OperatingHours({ ...HOURS,
      endMicros: [null, 86_400_000_000n, ...HOURS.endMicros.slice(2)],
    })).toThrow();
  });

  it("requires canonical ordered ten-code recovery entries", () => {
    const encoded = encodeU2Array({ kind: 5, values: CODES });
    expect(encoded.length).toBe(1165);
    expect(requireHash(encoded)).toBe(
      "dda6a0ab1ad7ca03b2285242347342ad70cc2283177b65517186ad4fa6378758",
    );
    expect(decodeU2Array(encoded, { kind: 5 })).toEqual({ kind: 5, values: CODES });
    expect(() => encodeU2Array({ kind: 5, values: CODES.slice(1) })).toThrow();
    expect(() => encodeU2Array({ kind: 5, values: [codeAt(1), codeAt(0), ...CODES.slice(2)] }))
      .toThrow();
    expect(() => encodeU2Array({ kind: 5,
      values: [{ ...codeAt(0), id: codeAt(1).id }, ...CODES.slice(1)],
    })).toThrow();
    expect(() => encodeU2Array({ kind: 5,
      values: [{ ...codeAt(0), selector: "____________" }, ...CODES.slice(1)],
    })).toThrow();
    expect(() => encodeU2Array({ kind: 5,
      values: [{ ...codeAt(0), verifier: "mrv1." + "A".repeat(42) + "B" },
        ...CODES.slice(1)],
    })).toThrow();
  });

  it("enforces bounded, registered, uniquely identified limiter scopes", () => {
    const scopes = [
      "v1:staff-password-reset-issue-target-user",
      "v1:staff-password-reset-issue-issuer-user",
      "v1:staff-password-reset-issue-organization",
      "v1:staff-password-reset-issue-client-address",
    ] as const;
    const ids = [A, B, C, "00000000-0000-0000-0000-000000000004"];
    const values: U2LimiterReservation[] = scopes.map((scope, index) => {
      const id = ids[index];
      if (!id) throw new Error("missing limiter test ID");
      return { scope, id, derivedKeyDigest: Buffer.alloc(32, index) };
    });
    function reservationAt(index: number): U2LimiterReservation {
      const item = values[index];
      if (!item) throw new Error("missing limiter test entry");
      return item;
    }
    const encoded = encodeU2Array({ kind: 6, expectedScopes: scopes, values });
    expect(encoded.length).toBe(497);
    expect(requireHash(encoded)).toBe(
      "6e24c1ef45937cfdbb312d3792c195d069bb60f708e757185dcbb0697baa8452",
    );
    expect(decodeU2Array(encoded, { kind: 6, expectedScopes: scopes })).toEqual({
      kind: 6, expectedScopes: scopes, values,
    });
    expect(() => encodeU2Array({ kind: 6, expectedScopes: scopes,
      values: [reservationAt(1), reservationAt(0), ...values.slice(2)],
    })).toThrow();
    expect(() => encodeU2Array({ kind: 6, expectedScopes: scopes,
      values: [{ ...reservationAt(0), derivedKeyDigest: Buffer.alloc(31) }, ...values.slice(1)],
    })).toThrow();
    expect(() => encodeU2Array({ kind: 6, expectedScopes: scopes,
      values: values.slice(1),
    })).toThrow();
  });

  it("rejects malformed, overflowed and unexpected compound wire shapes", () => {
    const base = encodeU2Array({ kind: 1, values: [A] });
    expect(() => decodeU2Array(Buffer.concat([base, Buffer.from([0])]), { kind: 1 }))
      .toThrow();
    expect(() => decodeU2Array(base.subarray(0, base.length - 1), { kind: 1 }))
      .toThrow();
    const domainLength = Buffer.from("VAYLET/VAP1/ARRAY\0", "ascii").length;
    for (const [index, byte] of [
      [domainLength, 2], // schema
      [domainLength + 2, 6], // element kind
      [domainLength + 3, 0xff], // count exceeds available
      [domainLength + 7, 4], // UUID element with UTF8 wire type
      [domainLength + 8, 0xff], // value length overflow
    ] as const) {
      const mutated = Buffer.from(base);
      mutated[index] = byte;
      expect(() => decodeU2Array(mutated, { kind: 1 })).toThrow();
    }
    const primitive = encodeU2Record([
      { id: 1, type: "u64", value: 9_007_199_254_740_993n },
    ]);
    expect(decodeU2Record(primitive)).toEqual([
      { id: 1, type: "u64", value: 9_007_199_254_740_993n },
    ]);
    expect(() => decodeU2Record(Buffer.concat([primitive, Buffer.from([0])]))).toThrow();
    expect(() => decodeU2Record(Buffer.from([0, 2, ...primitive.subarray(2)])))
      .toThrow();
    expect(() => encodeU2Record([
      { id: 1, type: "bool", value: true },
      { id: 1, type: "bool", value: false },
    ])).toThrow();
  });

  it("keeps persisted timestamp micros exact across JS Number precision limits", () => {
    expect(u2TimestampMicros("1700000000000001")).toBe(1_700_000_000_000_001n);
    expect(u2TimestampMicros("9007199254740993")).toBe(9_007_199_254_740_993n);
    expect(u2LocalTimeMicros(0n)).toBe(0n);
    for (const bad of ["0001", "-1", "+1", "1.1", "Infinity"]) {
      expect(() => u2TimestampMicros(bad)).toThrow();
    }
    expect(() => u2TimestampMicros(new Date() as never)).toThrow();
    expect(() => u2TimestampMicros(1n << 64n)).toThrow();
    expect(() => u2LocalTimeMicros(86_400_000_000n)).toThrow();
  });
});
