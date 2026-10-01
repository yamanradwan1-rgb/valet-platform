import { createHash, randomBytes } from "node:crypto";

export const staffInvitationTokenPattern = /^vsi1\.[A-Za-z0-9_-]{43}$/;
export const STAFF_INVITATION_TTL_HOURS = 24;

export function generateStaffInvitationToken(): string {
  return `vsi1.${randomBytes(32).toString("base64url")}`;
}

export function staffInvitationHash(token: string): string {
  return `staff-invite-sha256:v1:${createHash("sha256")
    .update(`staff-invite:v1:${token}`, "utf8")
    .digest("hex")}`;
}
