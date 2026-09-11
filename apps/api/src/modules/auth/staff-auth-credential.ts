import { createHash, randomBytes } from "node:crypto";

export const accessBearerPattern = /^Bearer (vsa1\.[A-Za-z0-9_-]{43})$/;
export const accessTokenPattern = /^vsa1\.[A-Za-z0-9_-]{43}$/;
export const refreshTokenPattern = /^vsr1\.[A-Za-z0-9_-]{43}$/;

export function generateStaffCredential(prefix: "vsa1." | "vsr1."): string {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

export function staffCredentialHash(
  type: "access" | "refresh",
  credential: string,
): string {
  return `staff-${type}-sha256:v1:${createHash("sha256")
    .update(credential, "utf8")
    .digest("hex")}`;
}
