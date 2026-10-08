import type { PostgresTransaction } from "../../common/database/postgres";
import type { AntiAbuseKey } from "./anti-abuse-key";

// Fixed dimensions only. T4 may export these through the existing observability boundary.
export const guestClassMeasurements = {
  A: { allowed: 0, blocked: 0, unavailable: 0 },
  B: { allowed: 0, blocked: 0, unavailable: 0 },
  C: { allowed: 0, blocked: 0, unavailable: 0 },
  D: { allowed: 0, blocked: 0, unavailable: 0 },
};

// Policy is supplied by Guest Access; Anti-Abuse does not own route semantics.
export async function countClassifiedGuest(
  transaction: PostgresTransaction,
  key: AntiAbuseKey,
  requestClass: "A" | "B" | "C" | "D",
  threshold: number,
  aggregate: number,
  group: AntiAbuseKey = key,
  credentialAggregate: number = aggregate,
): Promise<{ readonly id?: string; readonly retryAfter: number }> {
  try {
    const locks = [group, key].sort(
      (a, b) => a.lockHigh - b.lockHigh || a.lockLow - b.lockLow,
    );
    for (let index = 0; index < locks.length; index += 1) {
      const lock = locks[index]!;
      if (
        index > 0 &&
        lock.lockHigh === locks[index - 1]!.lockHigh &&
        lock.lockLow === locks[index - 1]!.lockLow
      )
        continue;
      await transaction.query("SELECT pg_advisory_xact_lock($1,$2)", [
        lock.lockHigh,
        lock.lockLow,
      ]);
    }
    await transaction.query(
      `UPDATE anti_abuse_events SET group_key_hash=$3
     WHERE scope=$1 AND key_hash=$2 AND group_key_hash IS NULL
       AND state IN ('PENDING','COUNTED') AND occurred_at > clock_timestamp()-interval '15 minutes'`,
      [key.scope, key.keyHash, group.keyHash],
    );
    const result = await transaction.query<{
      id: string | null;
      retry_after: number;
    }>(
      `WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS at),
     events AS MATERIALIZED (
       SELECT occurred_at, request_class, key_hash FROM anti_abuse_events, instant
       WHERE scope=$1 AND group_key_hash=$6 AND state IN ('PENDING','COUNTED')
         AND occurred_at > instant.at - interval '15 minutes'
     ), blockers AS (
       SELECT occurred_at FROM events ORDER BY occurred_at
       OFFSET GREATEST(0, (SELECT count(*) FROM events)-$5) LIMIT 1
     ), class_blockers AS (
       SELECT occurred_at FROM events
       WHERE request_class IS NULL OR request_class=$3
       ORDER BY occurred_at
       OFFSET GREATEST(0, (SELECT count(*) FROM events
         WHERE request_class IS NULL OR request_class=$3)-$4) LIMIT 1
     ), credential_blockers AS (
       SELECT occurred_at FROM events WHERE key_hash=$2 ORDER BY occurred_at
       OFFSET GREATEST(0,(SELECT count(*) FROM events WHERE key_hash=$2)-$7) LIMIT 1
     ), decision AS (
       SELECT GREATEST(
         CASE WHEN (SELECT count(*) FROM events) >= $5 THEN
           (SELECT CEIL(EXTRACT(epoch FROM (occurred_at+interval '15 minutes'-instant.at)))
            FROM blockers, instant) ELSE 0 END,
         CASE WHEN (SELECT count(*) FROM events
           WHERE request_class IS NULL OR request_class=$3) >= $4 THEN
           (SELECT CEIL(EXTRACT(epoch FROM (occurred_at+interval '15 minutes'-instant.at)))
            FROM class_blockers, instant) ELSE 0 END,
         CASE WHEN (SELECT count(*) FROM events WHERE key_hash=$2) >= $7 THEN
           (SELECT CEIL(EXTRACT(epoch FROM (occurred_at+interval '15 minutes'-instant.at)))
            FROM credential_blockers, instant) ELSE 0 END
       )::integer AS retry_after
     ), inserted AS (
       INSERT INTO anti_abuse_events(scope,key_hash,state,request_class,group_key_hash)
       SELECT $1,$2,'COUNTED',$3,$6 FROM decision WHERE retry_after=0 RETURNING id
     ) SELECT (SELECT id::text FROM inserted) AS id,
         LEAST(900,GREATEST(0,retry_after)) AS retry_after FROM decision`,
      [
        key.scope,
        key.keyHash,
        requestClass,
        threshold,
        aggregate,
        group.keyHash,
        credentialAggregate,
      ],
    );
    const row = result.rows[0];
    if (row === undefined || (row.id === null && row.retry_after === 0)) {
      throw new Error("Guest accounting unavailable.");
    }
    guestClassMeasurements[requestClass][
      row.retry_after === 0 ? "allowed" : "blocked"
    ] += 1;
    return {
      ...(row.id === null ? {} : { id: row.id }),
      retryAfter: row.retry_after,
    };
  } catch (error) {
    guestClassMeasurements[requestClass].unavailable += 1;
    throw error;
  }
}
