import { managementPresenceAuditDetailSchema } from "@valet/contracts";

/** Presence history only emits typed minimized facts, including when metadata is hostile. */
export function projectPresenceAuditDetails(
  source: Readonly<Record<string, unknown>>,
) {
  const safe: Record<string, unknown> = { kind: "PRESENCE" };
  for (const field of [
    "revision",
    "field",
    "operation",
    "state",
    "reason",
  ] as const) {
    const parsed = managementPresenceAuditDetailSchema.shape[field].safeParse(
      source[field],
    );
    if (parsed.success && parsed.data !== undefined) safe[field] = parsed.data;
  }
  return managementPresenceAuditDetailSchema.parse(safe);
}
