export class MfaSecurityUnavailableError extends Error {
  readonly code = "MFA_SECURITY_UNAVAILABLE" as const;

  constructor() {
    super("MFA security is unavailable.");
    this.name = "MfaSecurityUnavailableError";
  }
}

function readCanonicalSecret(value: string | undefined): Buffer {
  if (value === undefined || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new MfaSecurityUnavailableError();
  }
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.length !== 32 || decoded.toString("base64url") !== value) {
      throw new MfaSecurityUnavailableError();
    }
    return decoded;
  } catch (error) {
    if (error instanceof MfaSecurityUnavailableError) throw error;
    throw new MfaSecurityUnavailableError();
  }
}

export function readMfaTotpEncryptionKey(): Buffer {
  return readCanonicalSecret(process.env.MFA_TOTP_ENCRYPTION_KEY_B64URL);
}

export function readMfaRecoveryHmacKey(): Buffer {
  return readCanonicalSecret(process.env.MFA_RECOVERY_HMAC_SECRET_B64URL);
}
