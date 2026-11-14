import { createHash, randomBytes } from "node:crypto";
import { staffPasswordResetTokenSchema } from "@valet/contracts";

const verifierDomain = "staff-password-reset-sha256:v1:";

export function generateStaffPasswordResetToken(): string {
  return `vspr1.${randomBytes(32).toString("base64url")}`;
}

export function staffPasswordResetTokenHash(token: string): string {
  if (!staffPasswordResetTokenSchema.safeParse(token).success) {
    throw new TypeError("Invalid staff password reset token.");
  }
  const digest = createHash("sha256")
    .update(verifierDomain, "utf8")
    .update(token, "utf8")
    .digest("hex");
  return `${verifierDomain}${digest}`;
}
