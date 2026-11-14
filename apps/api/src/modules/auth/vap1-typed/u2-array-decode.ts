import { decodeU2Record } from "./u2-record";
import {
  encodeU2Array, type U2ArrayInput, type U2RecoveryEntry, type U2LimiterReservation,
} from "./u2-array";
import { type Vap1Field } from "../vap1/vap1-wire";

const DOMAIN = Buffer.from("VAYLET/VAP1/ARRAY\0", "ascii");
const MAX_BYTES = 32 * 1024;

type ArrayContract =
  | { readonly kind: 1 | 2 | 4 | 5 }
  | { readonly kind: 3; readonly expectedOrder: readonly string[] }
  | { readonly kind: 6; readonly expectedScopes: readonly string[] };

function scalar(code: number, bytes: Buffer): Vap1Field {
  const record = Buffer.alloc(11 + bytes.length);
  record.writeUInt16BE(1, 0);
  record.writeUInt16BE(1, 2);
  record.writeUInt16BE(1, 4);
  record.writeUInt8(code, 6);
  record.writeUInt32BE(bytes.length, 7);
  bytes.copy(record, 11);
  const fields = decodeU2Record(record);
  if (fields.length !== 1 || !fields[0]) throw new Error("U2 invalid scalar record");
  return fields[0];
}

function assertRowField(fields: readonly Vap1Field[], index: number,
  type: Vap1Field["type"]): Vap1Field {
  const field = fields[index];
  if (!field || field.id !== index + 1 || field.type !== type) {
    throw new Error("U2 unexpected compound field");
  }
  return field;
}

function stringField(fields: readonly Vap1Field[], index: number,
  type: "utf8" | "uuid"): string {
  const field = assertRowField(fields, index, type);
  return field.value as string;
}

function parseRecovery(bytes: Buffer): U2RecoveryEntry {
  const fields = decodeU2Record(Buffer.concat([Buffer.from([0, 1]), bytes]));
  if (fields.length !== 4) throw new Error("U2 invalid recovery record count");
  const slot = assertRowField(fields, 1, "u32");
  return {
    id: stringField(fields, 0, "uuid"),
    slot: slot.value as number,
    selector: stringField(fields, 2, "utf8"),
    verifier: stringField(fields, 3, "utf8"),
  };
}

function parseLimiter(bytes: Buffer): U2LimiterReservation {
  const fields = decodeU2Record(Buffer.concat([Buffer.from([0, 1]), bytes]));
  if (fields.length !== 3) throw new Error("U2 invalid limiter record count");
  const digest = assertRowField(fields, 2, "sha256");
  return {
    scope: stringField(fields, 0, "utf8"),
    id: stringField(fields, 1, "uuid"),
    derivedKeyDigest: digest.value as Buffer,
  };
}

export function decodeU2Array(bytes: Buffer, contract: ArrayContract): U2ArrayInput {
  if (!Buffer.isBuffer(bytes) || bytes.length < DOMAIN.length + 7 ||
    bytes.length > MAX_BYTES || !bytes.subarray(0, DOMAIN.length).equals(DOMAIN)) {
    throw new Error("U2 malformed array header");
  }
  const offset = DOMAIN.length;
  if (bytes.readUInt16BE(offset) !== 1 || bytes.readUInt8(offset + 2) !== contract.kind) {
    throw new Error("U2 array kind/schema mismatch");
  }
  const count = bytes.readUInt32BE(offset + 3);
  if (count > 1024) throw new Error("U2 array count overflow");
  const elements: { type: number; value: Buffer }[] = [];
  let cursor = offset + 7;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 5 > bytes.length) throw new Error("U2 truncated array element");
    const type = bytes.readUInt8(cursor);
    const length = bytes.readUInt32BE(cursor + 1);
    cursor += 5;
    if (length > bytes.length - cursor) throw new Error("U2 array length overflow");
    elements.push({ type, value: bytes.subarray(cursor, cursor + length) });
    cursor += length;
  }
  if (cursor !== bytes.length) throw new Error("U2 array trailing bytes");
  let decoded: U2ArrayInput;
  switch (contract.kind) {
    case 1:
      decoded = { kind: 1, values: elements.map(({ type, value }) => {
        const field = scalar(type, value);
        if (field.type !== "uuid") throw new Error("U2 array expected UUID");
        return field.value;
      }) };
      break;
    case 2:
      decoded = { kind: 2, values: elements.map(({ type, value }) => {
        const field = scalar(type, value);
        if (field.type !== "bool") throw new Error("U2 array expected BOOL");
        return field.value;
      }) };
      break;
    case 3:
      decoded = { kind: 3, expectedOrder: contract.expectedOrder,
        values: elements.map(({ type, value }) => {
          const field = scalar(type, value);
          if (field.type !== "utf8") throw new Error("U2 array expected enum");
          return field.value;
        }) };
      break;
    case 4:
      decoded = { kind: 4, values: elements.map(({ type, value }) => {
        const field = scalar(type, value);
        if (field.type === "null") return null;
        if (field.type !== "u64") throw new Error("U2 array expected local U64/NULL");
        return field.value;
      }) };
      break;
    case 5:
      decoded = { kind: 5, values: elements.map(({ type, value }) => {
        if (type !== 6) throw new Error("U2 array expected recovery record BYTES");
        return parseRecovery(value);
      }) };
      break;
    case 6:
      decoded = { kind: 6, expectedScopes: contract.expectedScopes,
        values: elements.map(({ type, value }) => {
          if (type !== 6) throw new Error("U2 array expected limiter record BYTES");
          return parseLimiter(value);
        }) };
      break;
  }
  if (!encodeU2Array(decoded).equals(bytes)) throw new Error("U2 noncanonical array");
  return decoded;
}
