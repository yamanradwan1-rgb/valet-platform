import { createHash } from "node:crypto";

export function hashStaffCredential(
  type: "access" | "refresh",
  credential: string,
): string {
  return `staff-${type}-sha256:v1:${createHash("sha256")
    .update(credential, "utf8")
    .digest("hex")}`;
}
