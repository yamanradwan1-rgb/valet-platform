import type { ManagementAuditEvent } from "@valet/contracts";

export function auditActorLabel(
  event: ManagementAuditEvent,
): { readonly label: string; readonly id?: string } | null {
  if (event.eventType === "UNKNOWN") return null;
  if (event.actor.type === "MEMBERSHIP") {
    return { id: event.actor.membershipId, label: "MEMBERSHIP" };
  }
  return { label: event.actor.type };
}

export function auditEntityLabel(event: ManagementAuditEvent): string {
  return event.entity === null ? "—" : event.entity.type;
}
