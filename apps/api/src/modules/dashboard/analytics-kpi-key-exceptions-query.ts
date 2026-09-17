import type { KeyExceptionType } from "@valet/contracts";
import type { PostgresTransaction } from "../../common/database/postgres";
import { analyticsWindowSelect } from "./analytics-period";

export const keyExceptionTypes = [
  "KEY_MISSING",
  "WRONG_KEY",
  "KEY_DAMAGED",
  "KEY_LOCKED_INSIDE",
] as const;

interface KeyExceptionRow {
  readonly count: number;
  readonly type: KeyExceptionType;
}

export async function queryKeyExceptions(
  transaction: PostgresTransaction,
  parameters: readonly unknown[],
): Promise<{ byType: KeyExceptionRow[]; count: number }> {
  const result = await transaction.query<KeyExceptionRow>(
    `WITH bounds AS (${analyticsWindowSelect(3, 4, 5)})
     SELECT incident.type, count(*)::int AS count
     FROM incidents AS incident CROSS JOIN bounds
     WHERE incident.organization_id = $1 AND incident.location_id = $2
       AND incident.created_at >= bounds.period_start
       AND incident.created_at < bounds.period_end
       AND incident.type IN ('KEY_MISSING','WRONG_KEY','KEY_DAMAGED','KEY_LOCKED_INSIDE')
     GROUP BY incident.type`,
    [...parameters],
  );
  const counts = new Map(result.rows.map((row) => [row.type, row.count] as const));
  const byType = keyExceptionTypes.map((type) => ({ count: counts.get(type) ?? 0, type }));
  return {
    byType,
    count: byType.reduce((sum, entry) => sum + entry.count, 0),
  };
}
