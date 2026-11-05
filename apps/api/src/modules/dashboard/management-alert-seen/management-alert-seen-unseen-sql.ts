import type { SeenOccurrenceCategory } from "./management-alert-seen-source";

/**
 * Add to the owning-source WHERE clause before ORDER BY and LIMIT (21), after
 * the current authenticated User+Organization+Location+source access guard.
 * This is for unread ATTENTION listings/counts, never exact source detail or
 * the Seen mutation's authorized idempotent retry. No post-LIMIT filtering.
 *
 * Binds are chosen by each owning reader: ALT-05/07/09/13 have `$3` as LIMIT
 * and use `$4` for the User in their list queries; ALT-15 has `$2` as LIMIT
 * and uses `$3` for the User. The source alias is source-specific and closed.
 */
export function unseenOccurrenceAntiJoin(
  category: SeenOccurrenceCategory,
  userParameterIndex: number,
): string {
  if (!Number.isSafeInteger(userParameterIndex) ||
      userParameterIndex < 1 || userParameterIndex > 32) {
    throw new RangeError("Invalid Seen User SQL bind position.");
  }
  // Runtime allowlist too: never interpolate an untrusted category into SQL.
  if (category !== "ALT-05" && category !== "ALT-07" &&
      category !== "ALT-09" && category !== "ALT-13" &&
      category !== "ALT-15") {
    throw new RangeError("Unsupported Seen category for source SQL.");
  }
  const source = category === "ALT-05" ? "takeover" : "event";
  const idColumn = category === "ALT-05" ? "operation_id" : "id";
  return `AND NOT EXISTS (
    SELECT 1 FROM management_alert_seen_receipts AS seen
    WHERE seen.organization_id = ${source}.organization_id
      AND seen.user_id = $${userParameterIndex}::uuid
      AND seen.category = '${category}'
      AND seen.source_id = ${source}.${idColumn}
  )`;
}
