import { type Vap1Field } from "../vap1/vap1-wire";
import {
  assertU2Fields, encodeU2Record, u2LocalTimeMicros, u2StrictAscii,
} from "./u2-record";

export const U2_WEEKDAYS = [
  "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY",
] as const;

export interface U2RecoveryEntry {
  readonly id: string;
  readonly slot: number;
  readonly selector: string;
  readonly verifier: string;
}

export interface U2LimiterReservation {
  readonly scope: string;
  readonly id: string;
  readonly derivedKeyDigest: Buffer;
}

export type U2ArrayInput =
  | { readonly kind: 1; readonly values: readonly string[] }
  | { readonly kind: 2; readonly values: readonly boolean[] }
  | { readonly kind: 3; readonly values: readonly string[];
      readonly expectedOrder: readonly string[] }
  | { readonly kind: 4; readonly values: readonly (bigint | null)[] }
  | { readonly kind: 5; readonly values: readonly U2RecoveryEntry[] }
  | { readonly kind: 6; readonly values: readonly U2LimiterReservation[];
      readonly expectedScopes: readonly string[] };

const DOMAIN = Buffer.from("VAYLET/VAP1/ARRAY\0", "ascii");
const MAX_BYTES = 32 * 1024;
const MAX_COUNT = 1024;
const VALID_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const B64URL = /^[A-Za-z0-9_-]+$/;
export const U2_R02_LIMITER_SCOPES = [
  "v1:staff-password-reset-issue-target-user",
  "v1:staff-password-reset-issue-issuer-user",
  "v1:staff-password-reset-issue-organization",
  "v1:staff-password-reset-issue-client-address",
] as const;
export const U2_R03_LIMITER_SCOPES = [
  "v1:staff-password-reset-redeem-client-address",
  "v1:staff-password-reset-redeem-credential",
] as const;
const PERMITTED_LIMITER_SEQUENCES: readonly (readonly string[])[] = [
  U2_R02_LIMITER_SCOPES,
  U2_R03_LIMITER_SCOPES,
  U2_R03_LIMITER_SCOPES.slice(0, 1),
  ["v1:staff-login-identifier"],
  ["v1:staff-onboarding-create-organization"],
  ["v1:staff-onboarding-resend-membership"],
  ["v1:mfa-totp-user"],
  ["v1:mfa-recovery-user"],
];

function canonicalBase64Url(value: string, bytes: number): boolean {
  if (!B64URL.test(value)) return false;
  const decoded = Buffer.from(value, "base64url");
  return decoded.length === bytes && decoded.toString("base64url") === value;
}

export function encodeU2RecoveryEntry(entry: U2RecoveryEntry): Buffer {
  if (!Number.isInteger(entry.slot) || entry.slot < 1 || entry.slot > 10 ||
    entry.selector.length !== 11 || !canonicalBase64Url(entry.selector, 8) ||
    !entry.verifier.startsWith("mrv1.") || entry.verifier.length !== 48 ||
    !canonicalBase64Url(entry.verifier.slice(5), 32)) {
    throw new Error("U2 noncanonical recovery entry");
  }
  const fields: Vap1Field[] = [
    { id: 1, type: "uuid", value: entry.id },
    { id: 2, type: "u32", value: entry.slot },
    { id: 3, type: "utf8", value: entry.selector },
    { id: 4, type: "utf8", value: entry.verifier },
  ];
  assertU2Fields(fields, [
    { type: "uuid" }, { type: "u32" }, { type: "utf8" }, { type: "utf8" },
  ]);
  // U2 recoveryEntryBytes starts with count=0004 (no schema U16).
  return encodeU2Record(fields).subarray(2);
}

export function encodeU2LimiterReservation(value: U2LimiterReservation): Buffer {
  u2StrictAscii(value.scope, 128);
  const fields: Vap1Field[] = [
    { id: 1, type: "utf8", value: value.scope },
    { id: 2, type: "uuid", value: value.id },
    { id: 3, type: "sha256", value: value.derivedKeyDigest },
  ];
  assertU2Fields(fields, [
    { type: "utf8", maxUtf8Bytes: 128 },
    { type: "uuid" },
    { type: "sha256" },
  ]);
  // U2 limiterReservationBytes starts with count=0003 (no schema U16).
  return encodeU2Record(fields).subarray(2);
}

function scalarBytes(field: Vap1Field): Buffer {
  // Canonical value encoder comes from the W1 TLV primitive.
  return encodeU2Record([{ ...field, id: 1 }]).subarray(11);
}

function elementBytes(input: U2ArrayInput): readonly [number, Buffer][] {
  switch (input.kind) {
    case 1: {
      let previous: Buffer | undefined;
      return input.values.map((value) => {
        if (!VALID_ID.test(value)) throw new Error("U2 invalid UUID array member");
        const bytes = scalarBytes({ id: 1, type: "uuid", value });
        if (previous && Buffer.compare(previous, bytes) >= 0) {
          throw new Error("U2 UUID array must ascend in network byte order");
        }
        previous = bytes;
        return [5, bytes];
      });
    }
    case 2:
      if (input.values.length !== 7) throw new Error("U2 weekdays need seven BOOL entries");
      return input.values.map((value) => [
        1, scalarBytes({ id: 1, type: "bool", value }),
      ]);
    case 3:
      if (input.values.length !== input.expectedOrder.length ||
        input.expectedOrder.length !== U2_WEEKDAYS.length ||
        input.expectedOrder.some((value, index) => value !== U2_WEEKDAYS[index]) ||
        input.values.some((value, index) => value !== input.expectedOrder[index])) {
        throw new Error("U2 enum array does not match registered order");
      }
      return input.values.map((value) => {
        u2StrictAscii(value, 64);
        return [4, scalarBytes({ id: 1, type: "utf8", value })];
      });
    case 4:
      if (input.values.length !== 7) throw new Error("U2 weekdays need seven times");
      return input.values.map((value) => value === null ?
        [0, Buffer.alloc(0)] :
        [3, scalarBytes({ id: 1, type: "u64", value: u2LocalTimeMicros(value) })]);
    case 5: {
      if (input.values.length !== 10) throw new Error("U2 recovery set requires ten entries");
      const ids = new Set<string>();
      return input.values.map((entry, index) => {
        if (entry.slot !== index + 1 || ids.has(entry.id)) {
          throw new Error("U2 recovery slots/IDs must be unique and ordered");
        }
        ids.add(entry.id);
        return [6, encodeU2RecoveryEntry(entry)];
      });
    }
    case 6: {
      if (input.values.length !== input.expectedScopes.length ||
        !PERMITTED_LIMITER_SEQUENCES.some((known) =>
          known.length === input.expectedScopes.length &&
          known.every((scope, index) => scope === input.expectedScopes[index]))) {
        throw new Error("U2 limiter reservation scope/cardinality mismatch");
      }
      const ids = new Set<string>();
      return input.values.map((item, index) => {
        if (item.scope !== input.expectedScopes[index] || ids.has(item.id)) {
          throw new Error("U2 reservation order/identity mismatch");
        }
        ids.add(item.id);
        return [6, encodeU2LimiterReservation(item)];
      });
    }
  }
}

/** U2 registered element kinds 01..06, no arbitrary nested JSON or BYTE bags. */
export function encodeU2Array(input: U2ArrayInput): Buffer {
  const elements = elementBytes(input);
  if (elements.length > MAX_COUNT) throw new Error("U2 array count overflow");
  const header = Buffer.alloc(7);
  header.writeUInt16BE(1, 0);
  header.writeUInt8(input.kind, 2);
  header.writeUInt32BE(elements.length, 3);
  const parts: Buffer[] = [DOMAIN, header];
  let total = DOMAIN.length + header.length;
  for (const [type, value] of elements) {
    const elementHeader = Buffer.alloc(5);
    elementHeader.writeUInt8(type, 0);
    elementHeader.writeUInt32BE(value.length, 1);
    total += 5 + value.length;
    if (total > MAX_BYTES) throw new Error("U2 array exceeds wire bound");
    parts.push(elementHeader, value);
  }
  return Buffer.concat(parts, total);
}

/** Seven aligned arrays; the legacy isClosed TRUE means CLOSED. */
export function encodeU2OperatingHours(input: {
  readonly days: readonly string[];
  readonly isClosed: readonly boolean[];
  readonly startMicros: readonly (bigint | null)[];
  readonly endMicros: readonly (bigint | null)[];
}): readonly [Buffer, Buffer, Buffer, Buffer] {
  if (input.days.length !== 7 || input.isClosed.length !== 7 ||
    input.startMicros.length !== 7 || input.endMicros.length !== 7) {
    throw new Error("U2 operating-hours arrays must each contain seven days");
  }
  for (let index = 0; index < 7; index += 1) {
    const start = input.startMicros[index];
    const end = input.endMicros[index];
    if (start === undefined || end === undefined || input.isClosed[index] === undefined) {
      throw new Error("U2 missing operating-hours member");
    }
    if (input.isClosed[index] ? (start !== null || end !== null) :
      (start === null || end === null ||
        u2LocalTimeMicros(start) >= u2LocalTimeMicros(end))) {
      throw new Error("U2 invalid open/closed hours window");
    }
  }
  return [
    encodeU2Array({ kind: 3, values: input.days, expectedOrder: U2_WEEKDAYS }),
    encodeU2Array({ kind: 2, values: input.isClosed }),
    encodeU2Array({ kind: 4, values: input.startMicros }),
    encodeU2Array({ kind: 4, values: input.endMicros }),
  ];
}
