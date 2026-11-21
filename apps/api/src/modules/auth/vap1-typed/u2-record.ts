import { createHash } from "node:crypto";

import {
  decodeVap1Frame, encodeVap1Frame, vap1U64, type Vap1Field, type Vap1WireType,
} from "../vap1/vap1-wire";

const FRAME_HEADER_BYTES = 17;
const RECORD_HEADER_BYTES = 4;
const MAX_RECORD_BYTES = 32 * 1024;

/** A record is not a VAP1 frame: U16 schema, U16 count, then canonical TLVs. */
export function encodeU2Record(fields: readonly Vap1Field[]): Buffer {
  const inner = encodeVap1Frame(1, fields).subarray(FRAME_HEADER_BYTES);
  const out = Buffer.alloc(RECORD_HEADER_BYTES + inner.length);
  if (out.length > MAX_RECORD_BYTES) throw new Error("U2 record exceeds bound");
  out.writeUInt16BE(1, 0);
  out.writeUInt16BE(fields.length, 2);
  inner.copy(out, RECORD_HEADER_BYTES);
  return out;
}

export function decodeU2Record(bytes: Buffer): readonly Vap1Field[] {
  if (!Buffer.isBuffer(bytes) || bytes.length < RECORD_HEADER_BYTES ||
    bytes.length > MAX_RECORD_BYTES || bytes.readUInt16BE(0) !== 1) {
    throw new Error("U2 invalid record schema/size");
  }
  const header = Buffer.from("VAYLET/VAP1\0", "ascii");
  const suffix = Buffer.alloc(5);
  suffix.writeUInt8(1, 0);
  suffix.writeUInt16BE(1, 1);
  suffix.writeUInt16BE(bytes.readUInt16BE(2), 3);
  const fullFrame = Buffer.concat([header, suffix, bytes.subarray(RECORD_HEADER_BYTES)]);
  const fields = decodeVap1Frame(fullFrame).fields;
  if (!encodeU2Record(fields).equals(bytes)) throw new Error("U2 noncanonical record");
  return fields;
}

export interface U2FieldSpec {
  readonly type: Exclude<Vap1WireType, "null">;
  readonly nullable?: true;
  readonly enumLabels?: readonly string[];
  readonly maxUtf8Bytes?: number;
  readonly lengths?: readonly number[];
}

export function assertU2Fields(
  fields: readonly Vap1Field[],
  specs: readonly U2FieldSpec[],
): void {
  if (fields.length !== specs.length) throw new Error("U2 incorrect field count");
  for (let index = 0; index < specs.length; index += 1) {
    const field = fields[index];
    const spec = specs[index];
    if (!field || !spec || field.id !== index + 1 ||
      (field.type !== spec.type && !(spec.nullable && field.type === "null"))) {
      throw new Error("U2 incorrect field ID/type/nullability");
    }
    if (field.type === "null") continue;
    if (field.type === "u64") vap1U64(field.value);
    if (field.type === "utf8") {
      if (spec.maxUtf8Bytes !== undefined &&
        Buffer.byteLength(field.value, "utf8") > spec.maxUtf8Bytes) {
        throw new Error("U2 text exceeds bound");
      }
      if (spec.enumLabels && !spec.enumLabels.includes(field.value)) {
        throw new Error("U2 unregistered enum value");
      }
    }
    if ((field.type === "bytes" || field.type === "sha256") && spec.lengths &&
      !spec.lengths.includes(field.value.length)) {
      throw new Error("U2 illegal byte length");
    }
  }
  encodeU2Record(fields);
}

export function u2PrefixDigest(fields: readonly Vap1Field[]): Buffer {
  return createHash("sha256").update(encodeU2Record(fields)).digest();
}

/** No JS Date, Number, timezone strings or lossy decimal casts in the CAS ABI. */
export function u2TimestampMicros(value: bigint | string): bigint {
  return vap1U64(value);
}

export function u2LocalTimeMicros(value: bigint | string): bigint {
  const micros = vap1U64(value);
  if (micros >= 86_400_000_000n) throw new Error("U2 local time overflow");
  return micros;
}

export function u2StrictAscii(value: string, maxLength: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength ||
    !/^[\x21-\x7e]+$/.test(value)) {
    throw new Error("U2 unregistered/invalid ASCII identifier");
  }
  return value;
}
