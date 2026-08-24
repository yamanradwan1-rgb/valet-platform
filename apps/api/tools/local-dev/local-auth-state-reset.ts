import type { QueryableClient } from "./demo-employee-credential";

export interface PurgeCounts {
  readonly antiAbuseEventsDeleted: number;
  readonly refreshCredentialsDeleted: number;
  readonly staffSessionsDeleted: number;
}

const PURGE_STATEMENTS = [
  { sql: "DELETE FROM staff_refresh_credentials", target: "refresh" },
  { sql: "DELETE FROM staff_auth_sessions", target: "sessions" },
  { sql: "DELETE FROM anti_abuse_events", target: "antiAbuse" },
] as const;

function deletedCount(rowCount: number | null): number {
  return rowCount ?? 0;
}

export async function purgeStaffAuthAndAntiAbuseState(
  client: QueryableClient,
): Promise<PurgeCounts> {
  await client.query("BEGIN");
  try {
    const counts: Record<string, number> = {};
    for (const statement of PURGE_STATEMENTS) {
      const result = await client.query(statement.sql);
      counts[statement.target] = deletedCount(result.rowCount);
    }
    await client.query("COMMIT");
    return {
      antiAbuseEventsDeleted: counts.antiAbuse ?? 0,
      refreshCredentialsDeleted: counts.refresh ?? 0,
      staffSessionsDeleted: counts.sessions ?? 0,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original purge failure.
    }
    throw error;
  }
}
