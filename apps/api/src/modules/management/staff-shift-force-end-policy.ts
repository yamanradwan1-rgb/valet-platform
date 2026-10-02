import { createHash } from "node:crypto";
import type { StaffShiftForceEndRequest } from "@valet/contracts";

export function staffShiftForceEndFingerprint(
  organizationId: string,
  shiftId: string,
  command: StaffShiftForceEndRequest,
): string {
  // Fixed UUID/literal fields precede the final free-text field. No ambiguous
  // delimiter may move content between fields; SQL verifies this same identity.
  return createHash("sha256")
    .update(
      [
        "staff-shift-force-end:v1",
        organizationId.toLowerCase(),
        shiftId.toLowerCase(),
        command.confirmation,
        command.reason,
      ].join("\n"),
    )
    .digest("hex");
}
