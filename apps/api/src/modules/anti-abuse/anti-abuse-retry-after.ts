import type { PostgresTransaction } from "../../common/database/postgres";
import type { AntiAbuseKey } from "./anti-abuse-key";

interface RetryRow {
  readonly retry_after: number;
}

export async function antiAbuseRetryAfter(
  transaction: PostgresTransaction,
  key: AntiAbuseKey,
  decisionAt: string,
  offset: number,
): Promise<number | undefined> {
  const result = await transaction.query<RetryRow>(
    `SELECT GREATEST(
              1,
              LEAST(
                900,
                CEIL(EXTRACT(EPOCH FROM (
                  occurred_at + INTERVAL '15 minutes' - $3::timestamptz
                )))::integer
              )
            ) AS retry_after
     FROM anti_abuse_events
     WHERE scope = $1
       AND key_hash = $2
       AND state IN ('PENDING', 'COUNTED')
       AND occurred_at > $3::timestamptz - INTERVAL '15 minutes'
     ORDER BY occurred_at ASC
     OFFSET $4
     LIMIT 1`,
    [key.scope, key.keyHash, decisionAt, offset],
  );
  return result.rows[0]?.retry_after;
}
