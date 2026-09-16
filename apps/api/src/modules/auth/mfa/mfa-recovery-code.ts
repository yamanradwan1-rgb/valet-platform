import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  MfaSecurityUnavailableError,
  readMfaRecoveryHmacKey,
} from "./mfa-crypto-config";

const recoveryCodePattern = /^vmr1-([A-Za-z0-9_-]{11})-([A-Za-z0-9_-]{27})$/;
const verifierPattern = /^mrv1\.([A-Za-z0-9_-]{43})$/;

export interface RecoveryCodeBinding {
  readonly factorId: string;
  readonly setGeneration: number;
  readonly userId: string;
}

export interface GeneratedRecoveryCode {
  readonly rawCode: string;
  readonly selector: string;
  readonly verifier: string;
}

function assertBinding(binding: RecoveryCodeBinding): void {
  if (
    binding.userId.length === 0 ||
    binding.factorId.length === 0 ||
    !Number.isSafeInteger(binding.setGeneration) ||
    binding.setGeneration < 1
  ) {
    throw new MfaSecurityUnavailableError();
  }
}

function deriveVerifier(
  rawCode: string,
  selector: string,
  binding: RecoveryCodeBinding,
): string {
  assertBinding(binding);
  try {
    const digest = createHmac("sha256", readMfaRecoveryHmacKey())
      .update("mfa-recovery-code:v1", "utf8")
      .update(Buffer.from([0]))
      .update(binding.userId, "utf8")
      .update(Buffer.from([0]))
      .update(binding.factorId, "utf8")
      .update(Buffer.from([0]))
      .update(String(binding.setGeneration), "utf8")
      .update(Buffer.from([0]))
      .update(selector, "utf8")
      .update(Buffer.from([0]))
      .update(rawCode, "utf8")
      .digest("base64url");
    return `mrv1.${digest}`;
  } catch (error) {
    if (error instanceof MfaSecurityUnavailableError) throw error;
    throw new MfaSecurityUnavailableError();
  }
}

export function recoveryCodeSelector(rawCode: string): string | undefined {
  return recoveryCodePattern.exec(rawCode)?.[1];
}

export function generateRecoveryCodes(
  binding: RecoveryCodeBinding,
): GeneratedRecoveryCode[] {
  assertBinding(binding);
  const result: GeneratedRecoveryCode[] = [];
  for (let index = 0; index < 10; index += 1) {
    const selector = randomBytes(8).toString("base64url");
    const secret = randomBytes(20).toString("base64url");
    const rawCode = `vmr1-${selector}-${secret}`;
    result.push({
      rawCode,
      selector,
      verifier: deriveVerifier(rawCode, selector, binding),
    });
  }
  return result;
}

export function verifyRecoveryCodeVerifier(input: RecoveryCodeBinding & {
  readonly rawCode: string;
  readonly verifier: string;
}): boolean {
  const selector = recoveryCodeSelector(input.rawCode);
  const stored = verifierPattern.exec(input.verifier)?.[1];
  if (selector === undefined || stored === undefined) return false;
  try {
    const candidate = verifierPattern.exec(
      deriveVerifier(input.rawCode, selector, input),
    )?.[1];
    if (candidate === undefined) return false;
    const storedBytes = Buffer.from(stored, "base64url");
    const candidateBytes = Buffer.from(candidate, "base64url");
    return (
      storedBytes.length === 32 &&
      candidateBytes.length === 32 &&
      timingSafeEqual(storedBytes, candidateBytes)
    );
  } catch (error) {
    if (error instanceof MfaSecurityUnavailableError) throw error;
    throw new MfaSecurityUnavailableError();
  }
}
