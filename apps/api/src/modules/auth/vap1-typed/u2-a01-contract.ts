import { decodeU2StaffLoginPayload } from "./u2-staff-login";
import { decodeU2StateFrame, type U2StateGroup } from "./u2-state";
import { type Vap1Field } from "../vap1/vap1-wire";

/** W2 migration118's exact A01 state array topology, not all U2 purposes. */
const A01_GROUP_COUNTS: Readonly<Partial<Record<U2StateGroup, number>>> = {
  5: 1, 6: 1, 19: 1,
};

function rowField(row: readonly Vap1Field[], id: number): Vap1Field {
  const field = row[id - 1];
  if (!field || field.id !== id) throw new Error("U2 A01 missing record field");
  return field;
}

function rowText(row: readonly Vap1Field[], id: number): string {
  const field = rowField(row, id);
  if (field.type !== "utf8") throw new Error("U2 A01 expected text");
  return field.value;
}

function rowUuid(row: readonly Vap1Field[], id: number): string {
  const field = rowField(row, id);
  if (field.type !== "uuid") throw new Error("U2 A01 expected UUID");
  return field.value;
}

function rowSha(row: readonly Vap1Field[], id: number): Buffer {
  const field = rowField(row, id);
  if (field.type !== "sha256") throw new Error("U2 A01 expected SHA256");
  return field.value;
}

function rowU64(row: readonly Vap1Field[], id: number): bigint {
  const field = rowField(row, id);
  if (field.type !== "u64") throw new Error("U2 A01 expected U64");
  return field.value;
}

function rowBytes(row: readonly Vap1Field[], id: number): Buffer {
  const field = rowField(row, id);
  if (field.type !== "bytes") throw new Error("U2 A01 expected BYTES");
  return field.value;
}

function assertEqualText(actual: string, expected: string, name: string): void {
  if (actual !== expected) throw new Error("U2 A01 " + name + " mismatch");
}

function assertEqualBytes(actual: Buffer, expected: Buffer, name: string): void {
  if (!actual.equals(expected)) throw new Error("U2 A01 " + name + " mismatch");
}

/**
 * Structural parity guard for W2 SQL118/119 A01 payload/locked-state pair.
 *
 * NOT authentication, authorization, PHC/Argon2 verification, key custody,
 * signature verification, or permission to sign. In particular, possession of
 * a PHC SHA256 digest (or SQL-returned matching state) is NOT proof that the
 * submitted raw password was actually verified by the trusted application.
 * The issuer must independently witness the real sender's password ceremony
 * and validate the signed proof/challenge's selected audience/key/XID.
 */
export function assertU2A01FramePair(
  payloadBytes: Buffer, stateBytes: Buffer,
): void {
  const payload = decodeU2StaffLoginPayload(payloadBytes);
  const state = decodeU2StateFrame(stateBytes);
  assertEqualText(state.operationId, payload.operationId, "operation");

  for (let id = 5; id <= 20; id += 1) {
    const rows = state.groups[id as U2StateGroup];
    if (!rows || rows.length !== (A01_GROUP_COUNTS[id as U2StateGroup] ?? 0)) {
      throw new Error("U2 A01 state group topology mismatch");
    }
  }

  const admission = state.groups[5]?.[0];
  const user = state.groups[6]?.[0];
  const limiter = state.groups[19]?.[0];
  if (!admission || !user || !limiter) throw new Error("U2 A01 missing locked rows");

  // Migration118 0005: exactly one ADMIT of singleton USER, no parent key.
  assertEqualText(rowText(admission, 2), "USER", "admission kind");
  assertEqualText(rowText(admission, 4), "ADMIT", "admission disposition");
  const expectedKey = Buffer.concat([
    Buffer.from([1]), Buffer.from(payload.userId.replaceAll("-", ""), "hex"),
  ]);
  assertEqualBytes(rowBytes(admission, 3), expectedKey, "admission key");
  const parent = rowField(admission, 8);
  if (parent.type !== "null") throw new Error("U2 A01 admission parent must be NULL");
  if (rowU64(admission, 5) <= 0n || rowU64(admission, 6) <= 0n) {
    throw new Error("U2 A01 invalid admission version/epoch");
  }

  // Migration118 0006: the locked PHC hash digest must be the one actually
  // verified by Argon2 upstream, NOT one supplied solely by the SQL caller.
  assertEqualText(rowUuid(user, 1), payload.userId, "locked user");
  assertEqualText(rowText(user, 3), "ACTIVE", "locked user status");
  const phc = rowSha(user, 4);
  const userDigest = rowSha(user, 5);
  assertEqualBytes(phc, payload.verifiedPasswordDigest, "locked PHC digest");
  assertEqualBytes(rowSha(admission, 7), userDigest, "admitted user digest");

  // Migration118 0019: a single durable pre-domain limiter reservation
  // bound to the exact operation; it is not an authentication witness.
  assertEqualText(rowUuid(limiter, 1), payload.limiterReservationId, "limiter ID");
  assertEqualText(rowText(limiter, 2), "v1:staff-login-identifier", "limiter scope");
  assertEqualText(rowText(limiter, 4), "PENDING", "limiter state");
  assertEqualText(rowUuid(limiter, 5), payload.operationId, "limiter operation");
}
