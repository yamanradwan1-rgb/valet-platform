import type { ManagementAuditKnownEvent } from "@valet/contracts";

export function auditRequestKey(input: {
  readonly scopeKey: string;
  readonly eventType: ManagementAuditKnownEvent | null;
  readonly cursor: string | null;
  readonly revision: number;
}): string {
  return [
    input.scopeKey,
    input.eventType ?? "all-events",
    input.cursor ?? "first",
    input.revision,
  ].join(":");
}
