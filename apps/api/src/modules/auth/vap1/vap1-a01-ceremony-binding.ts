import { createHash, timingSafeEqual } from "node:crypto";

import {
  accessTokenPattern,
  refreshTokenPattern,
  staffCredentialHash,
} from "../staff-auth-credential";
import type { UserAuthenticationRow } from "../staff-auth-types";
import { verifySubmittedStaffLoginPassword } from "../staff-auth-vap1-login-ceremony";
import { Argon2StaffPasswordVerifier } from "../staff-password-verification";
import { assertU2A01FramePair } from "../vap1-typed/u2-a01-contract";
import { decodeU2StaffLoginPayload } from "../vap1-typed/u2-staff-login";
import { decodeU2StateFrame } from "../vap1-typed/u2-state";
import { decodeVap1Proof } from "./vap1-proof";

export class Vap1A01CeremonyBindingInvalid extends Error {
  constructor() {
    super("VAP1 A01 credential binding is unavailable.");
    this.name = "Vap1A01CeremonyBindingInvalid";
  }
}

function matchDigest(actual: Buffer, expected: Buffer): boolean {
  return (
    actual.length === 32 &&
    expected.length === 32 &&
    timingSafeEqual(actual, expected)
  );
}

function validRawCredential(
  raw: unknown,
  prefix: "vsa1." | "vsr1.",
): raw is string {
  const pattern = prefix === "vsa1." ? accessTokenPattern : refreshTokenPattern;
  if (typeof raw !== "string" || !pattern.test(raw)) return false;
  const encoded = raw.slice(prefix.length);
  const bytes = Buffer.from(encoded, "base64url");
  return bytes.length === 32 && bytes.toString("base64url") === encoded;
}

/**
 * DORMANT, AUTH-OWNER-INTERNAL A01 consistency check. This performs one real
 * Argon2id verification on the submitted raw password (dummy for unknown
 * users), and matches the checked PHC, newly generated raw credentials,
 * intended operation/session IDs and closed U2 state to the exact S1 proof.
 *
 * It is NOT issuer authentication: the SQL descriptor/User could have been
 * forged by a caller. Only a future trusted Auth owner can supply a protected
 * leased transaction and independently locked User/ADMIT/limiter/key epoch.
 * This function never signs, exposes a verified password result, accesses SQL,
 * loads keys or issues a session. It returns no proof or reusable witness.
 * The zero-I/O denyUntilVap1StaffLoginAdmission stays mandatory.
 */
export async function assertA01CeremonyFrameCoherence(input: {
  readonly user: UserAuthenticationRow | undefined;
  readonly submittedPassword: string;
  readonly newRawAccessToken: string;
  readonly newRawRefreshToken: string;
  readonly newSessionId: string;
  readonly newRefreshId: string;
  readonly operationId: string;
  readonly limiterReservationId: string;
  readonly deploymentAudience: string;
  readonly selectedKeyId: string;
  readonly selectedKeyEpoch: bigint;
  readonly ownedBackendPid: number;
  readonly ownedFullXid: bigint;
  readonly payloadBytes: Buffer;
  readonly stateBytes: Buffer;
  readonly proofBytes: Buffer;
}): Promise<void> {
  try {
    const matchedPhc = await verifySubmittedStaffLoginPassword({
      user: input.user,
      submittedPassword: input.submittedPassword,
      verifier: new Argon2StaffPasswordVerifier(),
    });
    const user = input.user;
    if (
      user === undefined ||
      !validRawCredential(input.newRawAccessToken, "vsa1.") ||
      !validRawCredential(input.newRawRefreshToken, "vsr1.")
    )
      throw new Error("Invalid A01 candidate");

    // Never trust a returned SQL digest or caller-supplied PHC as a password
    // witness. Rebuild the payload/verifiers independently from real material.
    const payload = decodeU2StaffLoginPayload(input.payloadBytes);
    const state = decodeU2StateFrame(input.stateBytes);
    assertU2A01FramePair(input.payloadBytes, input.stateBytes);
    const proof = decodeVap1Proof(input.proofBytes);
    const phcDigest = createHash("sha256").update(matchedPhc, "utf8").digest();
    const payloadDigest = createHash("sha256")
      .update(input.payloadBytes)
      .digest();
    const stateDigest = createHash("sha256").update(input.stateBytes).digest();

    const admissionAudience = state.groups[5]?.[0]?.[0];
    if (
      payload.userId !== user.id ||
      payload.operationId !== input.operationId ||
      payload.newSessionId !== input.newSessionId ||
      payload.newRefreshId !== input.newRefreshId ||
      payload.limiterReservationId !== input.limiterReservationId ||
      payload.newAccessHash !==
        staffCredentialHash("access", input.newRawAccessToken) ||
      payload.newRefreshHash !==
        staffCredentialHash("refresh", input.newRawRefreshToken) ||
      !matchDigest(payload.verifiedPasswordDigest, phcDigest) ||
      state.keyPromotionEpoch !== input.selectedKeyEpoch ||
      admissionAudience?.type !== "utf8" ||
      admissionAudience.value !== input.deploymentAudience ||
      proof.purpose !== "STAFF_LOGIN_COMMIT" ||
      proof.actorKind !== "ANONYMOUS" ||
      proof.actorUserId !== null ||
      proof.actorSessionId !== null ||
      proof.organizationId !== null ||
      proof.membershipId !== null ||
      proof.subjectUserId !== user.id ||
      proof.operationId !== input.operationId ||
      proof.audience !== input.deploymentAudience ||
      proof.keyId !== input.selectedKeyId ||
      proof.backendPid !== input.ownedBackendPid ||
      proof.fullXid !== input.ownedFullXid ||
      !matchDigest(proof.payloadDigest, payloadDigest) ||
      !matchDigest(proof.stateDigest, stateDigest)
    )
      throw new Error("A01 descriptor mismatch");
  } catch {
    // No caller-visible differentiation of password, token, status, stale
    // PHC, SQL digest, audience, key selection or transaction mismatches.
    throw new Vap1A01CeremonyBindingInvalid();
  }
}
