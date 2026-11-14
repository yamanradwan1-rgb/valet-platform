import { createHash } from "node:crypto";

import {
  decodeVap1Frame, encodeVap1Frame, vap1U64,
  type Vap1Field, type Vap1FrameKind, type Vap1WireType,
} from "./vap1-wire";

export interface Vap1ProofFields {
  readonly keyId: string;
  readonly audience: string;
  readonly purpose: string;
  readonly operationId: string;
  readonly challengeNonce: Buffer;
  readonly backendPid: number;
  readonly fullXid: bigint;
  readonly actorKind: "ANONYMOUS" | "STAFF" | "OPERATOR";
  readonly actorUserId: string | null;
  readonly actorSessionId: string | null;
  readonly organizationId: string | null;
  readonly membershipId: string | null;
  readonly subjectUserId: string | null;
  readonly stateDigest: Buffer;
  readonly payloadDigest: Buffer;
  readonly issuedAtMs: bigint;
  readonly expiresAtMs: bigint;
}

// Match migration113's distinct SQL CHECKs, not a shared permissive identifier.
// The complete-match check also rejects the final-newline exception of JS `$`.
const KEY_ID_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,63}$/;
const AUDIENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const PURPOSE_PATTERN = /^[A-Z][A-Z0-9_]{2,95}$/;
const MAX_U64 = (1n << 64n) - 1n;
const EXPECTED_TYPES: readonly Vap1WireType[] = [
  "utf8", "utf8", "utf8", "utf8", "uuid", "bytes",
  "u32", "u64", "utf8", "uuid", "uuid", "uuid", "uuid",
  "uuid", "sha256", "sha256", "u64", "u64",
];

function requireSqlIdentifier(value: string, pattern: RegExp, field: string): void {
  if (typeof value !== "string" || pattern.exec(value)?.[0] !== value) {
    throw new Error(`VAP1 invalid ${field}`);
  }
}

function optionalUuid(id: number, value: string | null): Vap1Field {
  return value === null ? { id, type: "null", value: null } :
    { id, type: "uuid", value };
}

function validateProof(proof: Vap1ProofFields): void {
  requireSqlIdentifier(proof.keyId, KEY_ID_PATTERN, "keyId");
  requireSqlIdentifier(proof.audience, AUDIENCE_PATTERN, "audience");
  // Syntax only. The authenticated signer/SQL writer must also enforce the
  // enabled, actor-bound purpose registry; S1's LOGIN vector is not a route.
  requireSqlIdentifier(proof.purpose, PURPOSE_PATTERN, "purpose");
  if (!["STAFF", "ANONYMOUS", "OPERATOR"].includes(proof.actorKind)) {
    throw new Error("VAP1 invalid actor kind");
  }
  if (!Buffer.isBuffer(proof.challengeNonce) || proof.challengeNonce.length !== 32) {
    throw new Error("VAP1 nonce must be 32 bytes");
  }
  if (typeof proof.issuedAtMs !== "bigint" || typeof proof.expiresAtMs !== "bigint" ||
    vap1U64(proof.issuedAtMs) > MAX_U64 - 30000n ||
    proof.expiresAtMs !== proof.issuedAtMs + 30000n) {
    throw new Error("VAP1 expiry must equal database issue time + 30000ms");
  }
  if (!Number.isInteger(proof.backendPid) || proof.backendPid <= 0 ||
    typeof proof.fullXid !== "bigint" || proof.fullXid <= 0n) {
    throw new Error("VAP1 missing backend or full transaction ID");
  }
  if (proof.actorKind === "STAFF" &&
    (proof.actorUserId === null || proof.actorSessionId === null)) {
    throw new Error("VAP1 STAFF requires current User and exact session");
  }
  if (proof.actorKind === "ANONYMOUS" &&
    (proof.actorUserId !== null || proof.actorSessionId !== null)) {
    throw new Error("VAP1 ANONYMOUS cannot claim Staff identity/session");
  }
}

export function encodeVap1Proof(proof: Vap1ProofFields): Buffer {
  validateProof(proof);
  return encodeVap1Frame(0x02, [
    { id: 1, type: "utf8", value: "vap1" },
    { id: 2, type: "utf8", value: proof.keyId },
    { id: 3, type: "utf8", value: proof.audience },
    { id: 4, type: "utf8", value: proof.purpose },
    { id: 5, type: "uuid", value: proof.operationId },
    { id: 6, type: "bytes", value: proof.challengeNonce },
    { id: 7, type: "u32", value: proof.backendPid },
    { id: 8, type: "u64", value: proof.fullXid },
    { id: 9, type: "utf8", value: proof.actorKind },
    optionalUuid(10, proof.actorUserId),
    optionalUuid(11, proof.actorSessionId),
    optionalUuid(12, proof.organizationId),
    optionalUuid(13, proof.membershipId),
    optionalUuid(14, proof.subjectUserId),
    { id: 15, type: "sha256", value: proof.stateDigest },
    { id: 16, type: "sha256", value: proof.payloadDigest },
    { id: 17, type: "u64", value: proof.issuedAtMs },
    { id: 18, type: "u64", value: proof.expiresAtMs },
  ]);
}

export function decodeVap1Proof(bytes: Buffer): Vap1ProofFields {
  const frame = decodeVap1Frame(bytes);
  if (frame.kind !== 0x02 || frame.fields.length !== 18) {
    throw new Error("VAP1 expected exact 18-field proof frame");
  }
  const field = (index: number): Vap1Field => {
    const value = frame.fields[index - 1];
    if (!value || value.id !== index || (
      value.type !== EXPECTED_TYPES[index - 1] &&
      !(index >= 10 && index <= 14 && value.type === "null")
    )) throw new Error("VAP1 invalid proof field schema");
    return value;
  };
  const stringValue = (index: number): string => {
    const value = field(index);
    if (value.type !== "utf8" && value.type !== "uuid") throw new Error("VAP1 string type");
    return value.value;
  };
  const nullableUuid = (index: number): string | null => {
    const value = field(index);
    if (value.type === "null") return null;
    if (value.type !== "uuid") throw new Error("VAP1 UUID type");
    return value.value;
  };
  const u64 = (index: number): bigint => {
    const value = field(index);
    if (value.type !== "u64") throw new Error("VAP1 U64 type");
    return value.value;
  };
  const digest = (index: number): Buffer => {
    const value = field(index);
    if (value.type !== "sha256") throw new Error("VAP1 SHA256 type");
    return value.value;
  };
  const nonce = field(6);
  const pid = field(7);
  if (stringValue(1) !== "vap1" || nonce.type !== "bytes" || pid.type !== "u32") {
    throw new Error("VAP1 invalid proof version / wire types");
  }
  const result: Vap1ProofFields = {
    keyId: stringValue(2),
    audience: stringValue(3),
    purpose: stringValue(4),
    operationId: stringValue(5),
    challengeNonce: nonce.value,
    backendPid: pid.value,
    fullXid: u64(8),
    actorKind: stringValue(9) as Vap1ProofFields["actorKind"],
    actorUserId: nullableUuid(10),
    actorSessionId: nullableUuid(11),
    organizationId: nullableUuid(12),
    membershipId: nullableUuid(13),
    subjectUserId: nullableUuid(14),
    stateDigest: digest(15),
    payloadDigest: digest(16),
    issuedAtMs: u64(17),
    expiresAtMs: u64(18),
  };
  validateProof(result);
  if (!encodeVap1Proof(result).equals(bytes)) throw new Error("VAP1 noncanonical proof");
  return result;
}

export function vap1FrameDigest(kind: Extract<Vap1FrameKind, 0x01 | 0x03>,
  fields: readonly Vap1Field[]): Buffer {
  return createHash("sha256").update(encodeVap1Frame(kind, fields)).digest();
}
