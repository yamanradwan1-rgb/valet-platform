import { createHmac } from "node:crypto";

import { Injectable } from "@nestjs/common";

export type AntiAbuseScope =
  | "v1:condition-photo-upload-user"
  | "v1:condition-photo-upload-session"
  | "v1:condition-photo-status-user"
  | "v1:shift-presence-challenge-user"
  | "v1:shift-presence-exception-user"
  | "v1:shift-presence-status-user"
  | "v1:staff-activation-credential"
  | "v1:staff-activation-client-address"
  | "v1:staff-login-identifier"
  | "v1:staff-client-address"
  | "v1:guest-enrollment-address"
  | "v1:guest-client-address"
  | "v1:guest-token"
  | "v1:handoff-issuance-session"
  | "v1:handoff-verification-session"
  | "v1:mfa-totp-user"
  | "v1:mfa-recovery-user"
  | "v1:staff-onboarding-create-organization"
  | "v1:staff-onboarding-resend-membership";

export interface AntiAbuseKey {
  readonly keyHash: string;
  readonly lockHigh: number;
  readonly lockLow: number;
  readonly scope: AntiAbuseScope;
}

function readSecret(value: string | undefined): Buffer {
  if (value === undefined || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new Error(
      "ANTI_ABUSE_HMAC_SECRET_B64URL must encode exactly 32 random bytes.",
    );
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== 32 || decoded.toString("base64url") !== value) {
    throw new Error(
      "ANTI_ABUSE_HMAC_SECRET_B64URL must encode exactly 32 random bytes.",
    );
  }
  return decoded;
}

@Injectable()
export class AntiAbuseKeyDeriver {
  derive(scope: AntiAbuseScope, value: string): AntiAbuseKey {
    const secret = readSecret(process.env.ANTI_ABUSE_HMAC_SECRET_B64URL);
    const digest = createHmac("sha256", secret)
      .update(scope, "utf8")
      .update(Buffer.from([0]))
      .update(value, "utf8")
      .digest();
    return {
      keyHash: `anti-abuse-hmac-sha256:v1:${digest.toString("hex")}`,
      lockHigh: digest.readInt32BE(0),
      lockLow: digest.readInt32BE(4),
      scope,
    };
  }
}
