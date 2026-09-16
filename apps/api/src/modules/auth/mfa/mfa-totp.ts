import { generateSecret, verify } from "otplib";

import { MfaSecurityUnavailableError } from "./mfa-crypto-config";

export {
  protectTotpSecret,
  unprotectTotpSecret,
} from "./mfa-secret-protection";

const totpSecretPattern = /^[A-Z2-7]{32}$/;
const totpCodePattern = /^\d{6}$/;

export function generateTotpSecret(): string {
  try {
    const secret = generateSecret({ length: 20 });
    if (!totpSecretPattern.test(secret)) {
      throw new MfaSecurityUnavailableError();
    }
    return secret;
  } catch (error) {
    if (error instanceof MfaSecurityUnavailableError) throw error;
    throw new MfaSecurityUnavailableError();
  }
}

export async function verifyTotpCode(input: {
  readonly code: string;
  readonly lastAcceptedStep?: number | undefined;
  readonly now: Date;
  readonly secret: string;
}): Promise<number | undefined> {
  if (!totpCodePattern.test(input.code)) return undefined;
  if (
    !totpSecretPattern.test(input.secret) ||
    Number.isNaN(input.now.getTime()) ||
    (input.lastAcceptedStep !== undefined &&
      (!Number.isSafeInteger(input.lastAcceptedStep) ||
        input.lastAcceptedStep < 0))
  ) {
    throw new MfaSecurityUnavailableError();
  }
  try {
    const result = await verify({
      algorithm: "sha1",
      ...(input.lastAcceptedStep === undefined
        ? {}
        : { afterTimeStep: input.lastAcceptedStep }),
      digits: 6,
      epoch: Math.floor(input.now.getTime() / 1_000),
      epochTolerance: 30,
      period: 30,
      secret: input.secret,
      strategy: "totp",
      token: input.code,
    });
    return result.valid && "timeStep" in result ? result.timeStep : undefined;
  } catch {
    throw new MfaSecurityUnavailableError();
  }
}
