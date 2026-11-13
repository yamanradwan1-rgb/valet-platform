import { TextDecoder } from "node:util";

export type Vap1FrameKind = 0x01 | 0x02 | 0x03;
export type Vap1WireType =
  | "null" | "bool" | "u32" | "u64" | "utf8" | "uuid" | "bytes" | "sha256";
export type Vap1Field =
  | { readonly id: number; readonly type: "null"; readonly value: null }
  | { readonly id: number; readonly type: "bool"; readonly value: boolean }
  | { readonly id: number; readonly type: "u32"; readonly value: number }
  | { readonly id: number; readonly type: "u64"; readonly value: bigint }
  | { readonly id: number; readonly type: "utf8" | "uuid"; readonly value: string }
  | { readonly id: number; readonly type: "bytes" | "sha256"; readonly value: Buffer };

const DOMAIN = Buffer.from("VAYLET/VAP1\0", "ascii");
const HEADER_LENGTH = DOMAIN.length + 1 + 2 + 2;
const MAX_FRAME_LENGTH = 64 * 1024;
const MAX_FIELDS = 96;
const MAX_FIELD_LENGTH = 32 * 1024;
const U64_MAX = (1n << 64n) - 1n;
const TYPE_CODE: Record<Vap1WireType, number> = {
  null: 0, bool: 1, u32: 2, u64: 3,
  utf8: 4, uuid: 5, bytes: 6, sha256: 7,
};
const CODE_TYPE = new Map<number, Vap1WireType>(
  Object.entries(TYPE_CODE).map(([key, value]) => [value, key as Vap1WireType]),
);
const strictDecoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export function vap1U64(value: bigint | string): bigint {
  if (typeof value !== "bigint" && typeof value !== "string") {
    throw new Error("VAP1 U64 must be bigint or exact decimal string");
  }
  if (typeof value === "string" && !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error("VAP1 invalid decimal U64");
  }
  const parsed = typeof value === "bigint" ? value : BigInt(value);
  if (parsed < 0n || parsed > U64_MAX) throw new Error("VAP1 U64 out of range");
  return parsed;
}

export function vap1StrictUtf8(bytes: Buffer): string {
  let decoded: string;
  try {
    decoded = strictDecoder.decode(bytes);
  } catch {
    throw new Error("VAP1 invalid UTF-8");
  }
  if (decoded.startsWith("\ufeff") || !Buffer.from(decoded, "utf8").equals(bytes)) {
    throw new Error("VAP1 noncanonical UTF-8");
  }
  return decoded;
}

function encodeValue(field: Vap1Field): Buffer {
  switch (field.type) {
    case "null":
      if (field.value !== null) throw new Error("VAP1 invalid NULL");
      return Buffer.alloc(0);
    case "bool":
      if (typeof field.value !== "boolean") throw new Error("VAP1 invalid BOOL");
      return Buffer.from([field.value ? 1 : 0]);
    case "u32": {
      if (!Number.isInteger(field.value) || field.value < 0 || field.value > 0xffffffff) {
        throw new Error("VAP1 invalid U32");
      }
      const bytes = Buffer.alloc(4);
      bytes.writeUInt32BE(field.value);
      return bytes;
    }
    case "u64": {
      if (typeof field.value !== "bigint") throw new Error("VAP1 U64 must be bigint");
      const bytes = Buffer.alloc(8);
      bytes.writeBigUInt64BE(vap1U64(field.value));
      return bytes;
    }
    case "utf8": {
      if (typeof field.value !== "string") throw new Error("VAP1 invalid UTF8 value");
      const bytes = Buffer.from(field.value, "utf8");
      if (vap1StrictUtf8(bytes) !== field.value) throw new Error("VAP1 invalid Unicode");
      return bytes;
    }
    case "uuid":
      if (typeof field.value !== "string" ||
        !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(field.value)) {
        throw new Error("VAP1 UUID must be lowercase canonical");
      }
      return Buffer.from(field.value.replaceAll("-", ""), "hex");
    case "bytes":
    case "sha256":
      if (!Buffer.isBuffer(field.value)) throw new Error("VAP1 BYTES must be Buffer");
      if (field.type === "sha256" && field.value.length !== 32) {
        throw new Error("VAP1 SHA256 must be 32 bytes");
      }
      return Buffer.from(field.value);
  }
}

export function encodeVap1Frame(
  kind: Vap1FrameKind,
  fields: readonly Vap1Field[],
): Buffer {
  if (kind !== 1 && kind !== 2 && kind !== 3) throw new Error("VAP1 unknown frame kind");
  if (fields.length > MAX_FIELDS) throw new Error("VAP1 excessive field count");
  let previous = 0;
  const parts: Buffer[] = [DOMAIN];
  const header = Buffer.alloc(5);
  header.writeUInt8(kind, 0);
  header.writeUInt16BE(1, 1);
  header.writeUInt16BE(fields.length, 3);
  parts.push(header);
  let total = HEADER_LENGTH;
  for (const field of fields) {
    if (!Number.isInteger(field.id) || field.id <= previous || field.id > 0xffff) {
      throw new Error("VAP1 field IDs must be strictly ascending");
    }
    previous = field.id;
    const code = TYPE_CODE[field.type];
    if (code === undefined) throw new Error("VAP1 unknown field type");
    const value = encodeValue(field);
    if (value.length > MAX_FIELD_LENGTH) throw new Error("VAP1 field too large");
    const fieldHeader = Buffer.alloc(7);
    fieldHeader.writeUInt16BE(field.id, 0);
    fieldHeader.writeUInt8(code, 2);
    fieldHeader.writeUInt32BE(value.length, 3);
    total += fieldHeader.length + value.length;
    if (total > MAX_FRAME_LENGTH) throw new Error("VAP1 frame too large");
    parts.push(fieldHeader, value);
  }
  return Buffer.concat(parts, total);
}

function decodeField(id: number, code: number, raw: Buffer): Vap1Field {
  const type = CODE_TYPE.get(code);
  switch (type) {
    case "null":
      if (raw.length !== 0) break;
      return { id, type, value: null };
    case "bool":
      if (raw.length !== 1 || (raw[0] !== 0 && raw[0] !== 1)) break;
      return { id, type, value: raw[0] === 1 };
    case "u32":
      if (raw.length !== 4) break;
      return { id, type, value: raw.readUInt32BE() };
    case "u64":
      if (raw.length !== 8) break;
      return { id, type, value: raw.readBigUInt64BE() };
    case "utf8":
      return { id, type, value: vap1StrictUtf8(raw) };
    case "uuid": {
      if (raw.length !== 16) break;
      const hex = raw.toString("hex");
      return { id, type, value: [
        hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16),
        hex.slice(16, 20), hex.slice(20),
      ].join("-") };
    }
    case "bytes":
      return { id, type, value: Buffer.from(raw) };
    case "sha256":
      if (raw.length !== 32) break;
      return { id, type, value: Buffer.from(raw) };
  }
  throw new Error("VAP1 noncanonical wire value");
}

export function decodeVap1Frame(
  bytes: Buffer,
): { readonly kind: Vap1FrameKind; readonly fields: readonly Vap1Field[] } {
  if (!Buffer.isBuffer(bytes) || bytes.length < HEADER_LENGTH ||
    bytes.length > MAX_FRAME_LENGTH || !bytes.subarray(0, DOMAIN.length).equals(DOMAIN)) {
    throw new Error("VAP1 invalid frame header or size");
  }
  const kind = bytes[DOMAIN.length];
  const schema = bytes.readUInt16BE(DOMAIN.length + 1);
  const count = bytes.readUInt16BE(DOMAIN.length + 3);
  if ((kind !== 1 && kind !== 2 && kind !== 3) || schema !== 1 || count > MAX_FIELDS) {
    throw new Error("VAP1 invalid frame kind/schema/count");
  }
  const fields: Vap1Field[] = [];
  let offset = HEADER_LENGTH;
  let previous = 0;
  for (let i = 0; i < count; i += 1) {
    if (offset + 7 > bytes.length) throw new Error("VAP1 truncated field header");
    const id = bytes.readUInt16BE(offset);
    const code = bytes.readUInt8(offset + 2);
    const length = bytes.readUInt32BE(offset + 3);
    offset += 7;
    if (id <= previous || length > MAX_FIELD_LENGTH ||
      length > bytes.length - offset) throw new Error("VAP1 invalid field ordering/length");
    previous = id;
    fields.push(decodeField(id, code, bytes.subarray(offset, offset + length)));
    offset += length;
  }
  if (offset !== bytes.length) throw new Error("VAP1 trailing bytes");
  return { kind, fields };
}
