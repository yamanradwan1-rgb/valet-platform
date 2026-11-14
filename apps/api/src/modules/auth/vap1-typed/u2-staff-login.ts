import { createHash } from "node:crypto";

import {
  decodeVap1Frame, encodeVap1Frame, type Vap1Field,
} from "../vap1/vap1-wire";
import { assertU2Fields } from "./u2-record";

export const U2_STAFF_LOGIN_PURPOSE = "STAFF_LOGIN_COMMIT" as const;

export interface U2StaffLoginPayload {
  readonly operationId: string;
  readonly userId: string;
  /** SHA256 of the exact persisted PHC bytes actually checked with Argon2. */
  readonly verifiedPasswordDigest: Buffer;
  readonly newSessionId: string;
  readonly newRefreshId: string;
  /** Persisted verifier, never raw access/refresh credentials. */
  readonly newAccessHash: string;
  readonly newRefreshHash: string;
  readonly limiterReservationId: string;
}

const STAFF_ACCESS_HASH = /^staff-access-sha256:v1:[0-9a-f]{64}$/;
const STAFF_REFRESH_HASH = /^staff-refresh-sha256:v1:[0-9a-f]{64}$/;
const FIELDS = [
  { type: "u32" }, { type: "uuid" }, { type: "utf8", enumLabels: [U2_STAFF_LOGIN_PURPOSE] },
  { type: "uuid" }, { type: "sha256" }, { type: "uuid" }, { type: "uuid" },
  { type: "utf8", maxUtf8Bytes: 100 },
  { type: "utf8", maxUtf8Bytes: 100 },
  { type: "uuid" },
] as const;

/** Called only with evidence checked at the genuine password ceremony boundary. */
export function encodeU2StaffLoginPayload(input: U2StaffLoginPayload): Buffer {
  if (!STAFF_ACCESS_HASH.test(input.newAccessHash) ||
    !STAFF_REFRESH_HASH.test(input.newRefreshHash)) {
    throw new Error("U2 invalid Staff verifier format");
  }
  const fields: Vap1Field[] = [
    { id: 1, type: "u32", value: 1 },
    { id: 2, type: "uuid", value: input.operationId },
    { id: 3, type: "utf8", value: U2_STAFF_LOGIN_PURPOSE },
    { id: 4, type: "uuid", value: input.userId },
    { id: 5, type: "sha256", value: input.verifiedPasswordDigest },
    { id: 6, type: "uuid", value: input.newSessionId },
    { id: 7, type: "uuid", value: input.newRefreshId },
    { id: 8, type: "utf8", value: input.newAccessHash },
    { id: 9, type: "utf8", value: input.newRefreshHash },
    { id: 10, type: "uuid", value: input.limiterReservationId },
  ];
  assertU2Fields(fields, FIELDS);
  return encodeVap1Frame(1, fields);
}

/** Closed strict decode, including explicit purpose and all 10 field IDs/types. */
export function decodeU2StaffLoginPayload(bytes: Buffer): U2StaffLoginPayload {
  const frame = decodeVap1Frame(bytes);
  if (frame.kind !== 1) throw new Error("U2 Staff login must be payload kind 01");
  assertU2Fields(frame.fields, FIELDS);
  const f = frame.fields;
  if (f[0]?.type !== "u32" || f[0].value !== 1) {
    throw new Error("U2 Staff login invalid schema version");
  }
  const uuid = (index: number): string => {
    const field = f[index];
    if (field?.type !== "uuid") throw new Error("U2 expected UUID");
    return field.value;
  };
  const text = (index: number): string => {
    const field = f[index];
    if (field?.type !== "utf8") throw new Error("U2 expected UTF8");
    return field.value;
  };
  const sha = (index: number): Buffer => {
    const field = f[index];
    if (field?.type !== "sha256") throw new Error("U2 expected SHA256");
    return field.value;
  };
  const input: U2StaffLoginPayload = {
    operationId: uuid(1),
    userId: uuid(3),
    verifiedPasswordDigest: sha(4),
    newSessionId: uuid(5),
    newRefreshId: uuid(6),
    newAccessHash: text(7),
    newRefreshHash: text(8),
    limiterReservationId: uuid(9),
  };
  if (!encodeU2StaffLoginPayload(input).equals(bytes)) {
    throw new Error("U2 Staff login noncanonical payload");
  }
  return input;
}

export function u2StaffLoginPayloadDigest(input: U2StaffLoginPayload): Buffer {
  return createHash("sha256").update(encodeU2StaffLoginPayload(input)).digest();
}
