import {
  staffPushPayloadSchema,
  type StaffPushPayload,
} from "@valet/contracts";

const wireKeys = ["intentId", "kind", "routeIntent", "schemaVersion"];

function hasExactWireKeys(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("\u0000") ===
      [...wireKeys].sort().join("\u0000")
  );
}

/** Strictly normalizes FCM's string-only data map into the logical contract. */
export function parseNativePushWirePayload(
  value: unknown,
): StaffPushPayload | null {
  if (!hasExactWireKeys(value)) return null;
  if (
    typeof value.schemaVersion !== "string" ||
    typeof value.kind !== "string" ||
    typeof value.intentId !== "string" ||
    typeof value.routeIntent !== "string" ||
    value.schemaVersion !== "1"
  ) {
    return null;
  }
  const parsed = staffPushPayloadSchema.safeParse({
    schemaVersion: 1,
    kind: value.kind,
    intentId: value.intentId,
    routeIntent: value.routeIntent,
  });
  return parsed.success ? parsed.data : null;
}
