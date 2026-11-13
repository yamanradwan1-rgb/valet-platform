import { createHash, randomBytes } from "node:crypto";

const verifierDomain = "staff-password-reset-sha256:v1:";

export function generateStaffPasswordResetToken(): string {
  return `vspr1.${randomBytes(32).toString("base64url")}`;
}

export function staffPasswordResetTokenHash(token: string): string {
  const digest = createHash("sha256")
    .update(verifierDomain, "utf8")
    .update(token, "utf8")
    .digest("hex");
  return `${verifierDomain}${digest}`;
}
