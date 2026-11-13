import { createHash } from "node:crypto";

import {
  decodeVap1Frame, encodeVap1Frame, type Vap1Field,
} from "../vap1/vap1-wire";
import {
  assertU2Fields, decodeU2Record, encodeU2Record, u2PrefixDigest,
  u2StrictAscii,
} from "./u2-record";
import { U2_STATE_GROUPS } from "./u2-state-schema";

const ARRAY_DOMAIN = Buffer.from("VAYLET/VAP1/ARRAY\0", "ascii");
const MAX_BYTES = 32 * 1024;
export type U2StateGroup = 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
  13 | 14 | 15 | 16 | 17 | 18 | 19 | 20;

export interface U2StateInput {
  readonly operationId: string;
  readonly purpose: "STAFF_LOGIN_COMMIT";
  readonly keyPromotionEpoch: bigint;
  /** Fields are in their frozen 1-based record order; omitted groups are empty. */
  readonly groups: Readonly<Partial<Record<U2StateGroup, readonly (readonly Vap1Field[])[]>>>;
}

/** Exact class record; no claimed credential verification or signer authority. */
export function encodeU2StateRow(
  group: U2StateGroup, fields: readonly Vap1Field[],
): Buffer {
  const schema = U2_STATE_GROUPS[group];
  if (!schema) throw new Error("U2 unknown state record class");
  assertU2Fields(fields, schema.attributes);
  if (schema.derivedDigestId) {
    const last = fields[schema.derivedDigestId - 1];
    if (last?.type !== "sha256" ||
      !last.value.equals(u2PrefixDigest(fields.slice(0, schema.derivedDigestId - 1)))) {
      throw new Error("U2 row prefix digest mismatch");
    }
  }
  if (group === 5) {
    const key = fields[2];
    if (key?.type !== "bytes" || (key.value[0] !== 1 && key.value[0] !== 2) ||
      (key.value[0] === 1 && key.value.length !== 17) ||
      (key.value[0] === 2 && key.value.length !== 49)) {
      throw new Error("U2 admission key prefix/length mismatch");
    }
  }
  return encodeU2Record(fields);
}

function keyBytes(group: U2StateGroup, fields: readonly Vap1Field[]): Buffer {
  const schema = U2_STATE_GROUPS[group];
  if (!schema) throw new Error("U2 unregistered group key");
  const parts = schema.keyIndices.map((index) => {
    const field = fields[index];
    if (!field || field.type === "null") throw new Error("U2 nullable sorting key");
    const raw = encodeU2Record([{ ...field, id: 1 }]).subarray(11);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(raw.length);
    return Buffer.concat([length, raw]);
  });
  return Buffer.concat(parts);
}

export function encodeU2StateGroup(
  group: U2StateGroup, rows: readonly (readonly Vap1Field[])[],
): Buffer {
  if (!U2_STATE_GROUPS[group] || rows.length > 1024) {
    throw new Error("U2 invalid state group/count");
  }
  const header = Buffer.alloc(7);
  header.writeUInt16BE(1, 0);
  header.writeUInt8(group + 0x0b, 2); // 0005 => 0x10; 0020 => 0x1f
  header.writeUInt32BE(rows.length, 3);
  const parts: Buffer[] = [ARRAY_DOMAIN, header];
  let total = ARRAY_DOMAIN.length + header.length;
  let previous: Buffer | undefined;
  for (const fields of rows) {
    const row = encodeU2StateRow(group, fields);
    const key = keyBytes(group, fields);
    if (previous && Buffer.compare(previous, key) >= 0) {
      throw new Error("U2 state rows must be strictly key-sorted");
    }
    previous = key;
    const recordHeader = Buffer.alloc(5);
    recordHeader.writeUInt8(6, 0);
    recordHeader.writeUInt32BE(row.length, 1);
    total += recordHeader.length + row.length;
    if (total > MAX_BYTES) throw new Error("U2 state group exceeds bound");
    parts.push(recordHeader, row);
  }
  return Buffer.concat(parts, total);
}

export function decodeU2StateGroup(group: U2StateGroup, bytes: Buffer):
  readonly (readonly Vap1Field[])[] {
  if (!Buffer.isBuffer(bytes) || bytes.length < ARRAY_DOMAIN.length + 7 ||
    bytes.length > MAX_BYTES || !bytes.subarray(0, ARRAY_DOMAIN.length).equals(ARRAY_DOMAIN)) {
    throw new Error("U2 invalid state group bytes");
  }
  const offset = ARRAY_DOMAIN.length;
  if (bytes.readUInt16BE(offset) !== 1 || bytes.readUInt8(offset + 2) !== group + 0x0b) {
    throw new Error("U2 state group schema/kind mismatch");
  }
  const count = bytes.readUInt32BE(offset + 3);
  if (count > 1024) throw new Error("U2 state group excessive rows");
  let cursor = offset + 7;
  const rows: Vap1Field[][] = [];
  for (let index = 0; index < count; index += 1) {
    if (cursor + 5 > bytes.length || bytes.readUInt8(cursor) !== 6) {
      throw new Error("U2 state element is not BYTES");
    }
    const length = bytes.readUInt32BE(cursor + 1);
    cursor += 5;
    if (length > bytes.length - cursor) throw new Error("U2 state row length mismatch");
    rows.push([...decodeU2Record(bytes.subarray(cursor, cursor + length))]);
    cursor += length;
  }
  if (cursor !== bytes.length || !encodeU2StateGroup(group, rows).equals(bytes)) {
    throw new Error("U2 noncanonical state rows/trailing bytes");
  }
  return rows;
}

export function encodeU2StateFrame(input: U2StateInput): Buffer {
  if (input.purpose !== "STAFF_LOGIN_COMMIT") {
    throw new Error("U2 unregistered purpose");
  }
  u2StrictAscii(input.purpose, 96);
  if (typeof input.keyPromotionEpoch !== "bigint" || input.keyPromotionEpoch <= 0n) {
    throw new Error("U2 invalid committed key promotion epoch");
  }
  for (const key of Object.keys(input.groups)) {
    if (!/^(?:[5-9]|1[0-9]|20)$/.test(key)) {
      throw new Error("U2 unregistered state group");
    }
  }
  const fields: Vap1Field[] = [
    { id: 1, type: "u32", value: 1 },
    { id: 2, type: "uuid", value: input.operationId },
    { id: 3, type: "utf8", value: input.purpose },
    { id: 4, type: "u64", value: input.keyPromotionEpoch },
  ];
  for (let group = 5; group <= 20; group += 1) {
    const id = group as U2StateGroup;
    fields.push({
      id, type: "bytes", value: encodeU2StateGroup(id, input.groups[id] ?? []),
    });
  }
  return encodeVap1Frame(3, fields);
}

export function decodeU2StateFrame(bytes: Buffer): U2StateInput {
  const frame = decodeVap1Frame(bytes);
  if (frame.kind !== 3 || frame.fields.length !== 20) {
    throw new Error("U2 state must contain exactly 20 TLV fields");
  }
  const fields = frame.fields;
  if (fields[0]?.id !== 1 || fields[0].type !== "u32" || fields[0].value !== 1 ||
    fields[1]?.id !== 2 || fields[1].type !== "uuid" ||
    fields[2]?.id !== 3 || fields[2].type !== "utf8" ||
    fields[3]?.id !== 4 || fields[3].type !== "u64") {
    throw new Error("U2 state metadata mismatch");
  }
  const groups: Partial<Record<U2StateGroup, readonly (readonly Vap1Field[])[]>> = {};
  for (let group = 5; group <= 20; group += 1) {
    const field = fields[group - 1];
    if (!field || field.id !== group || field.type !== "bytes") {
      throw new Error("U2 state group absent or wrong type");
    }
    groups[group as U2StateGroup] =
      decodeU2StateGroup(group as U2StateGroup, field.value);
  }
  const input: U2StateInput = {
    operationId: fields[1].value,
    purpose: fields[2].value as U2StateInput["purpose"],
    keyPromotionEpoch: fields[3].value,
    groups,
  };
  if (!encodeU2StateFrame(input).equals(bytes)) throw new Error("U2 noncanonical state");
  return input;
}

export function u2StateDigest(input: U2StateInput): Buffer {
  return createHash("sha256").update(encodeU2StateFrame(input)).digest();
}
