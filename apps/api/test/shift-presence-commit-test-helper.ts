import { setImmediate } from "node:timers/promises";
import type { Pool, PoolClient } from "pg";
import type { PresenceServerTestContext } from "./shift-presence-server-test-context";

export type CommitOutcome = "COMMIT" | "ROLLBACK" | "UNKNOWN";
/** Owner fixture boundary with real commit followed by injected acknowledgement loss. */
export async function finishPresenceBoundary(
  client: PoolClient,
  outcome: CommitOutcome,
) {
  await client.query(outcome === "ROLLBACK" ? "ROLLBACK" : "COMMIT");
  if (outcome === "UNKNOWN") throw new Error("TEST_COMMIT_OUTCOME_UNKNOWN");
}
const pendingBarriers = new Set<(outcome: CommitOutcome) => void>();
export function abortPresenceCommitBarriers() {
  for (const finish of pendingBarriers) finish("ROLLBACK");
}
/** Pause the actual protected transaction immediately before COMMIT, never by sleeping. */
export function presenceCommitBarrier(pool: Pool) {
  let reached!: () => void;
  let finish!: (outcome: CommitOutcome) => void;
  const atCommit = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const outcome = new Promise<CommitOutcome>((resolve) => {
    finish = (decision) => {
      pendingBarriers.delete(finish);
      resolve(decision);
    };
  });
  pendingBarriers.add(finish);
  const gated = new Proxy(pool, {
    get(target, property) {
      if (property === "connect")
        return async () => {
          const client = await target.connect();
          return new Proxy(client, {
            get(connection, key) {
              if (key === "query")
                return async (text: string, ...args: unknown[]) => {
                  if (text === "COMMIT") {
                    reached();
                    const decision = await outcome;
                    if (decision === "ROLLBACK") {
                      await connection.query("ROLLBACK");
                      throw new Error("TEST_ROLLBACK");
                    }
                    const result = await connection.query(text);
                    if (decision === "UNKNOWN")
                      throw new Error("TEST_COMMIT_OUTCOME_UNKNOWN");
                    return result;
                  }
                  return Reflect.apply(connection.query, connection, [
                    text,
                    ...args,
                  ]);
                };
              const value = Reflect.get(connection, key, connection);
              return typeof value === "function"
                ? value.bind(connection)
                : value;
            },
          });
        };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { pool: gated, atCommit, finish };
}

export async function observePresenceCommandWait(
  db: PresenceServerTestContext,
) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await db.adminPool.query(
      `SELECT pid FROM pg_stat_activity
      WHERE datname=$1 AND usename=$2 AND wait_event_type='Lock'`,
      [db.databaseName, db.runtimeRole],
    );
    if (result.rowCount !== 0) return;
    await setImmediate();
  }
  throw new Error(
    "Expected current-authority or configuration PostgreSQL barrier",
  );
}

export async function mutationAuditCount(
  db: PresenceServerTestContext,
  organizationId: string,
  eventType: string,
) {
  return (
    await db.adminPool.query(
      `SELECT count(*)::int AS count FROM audit_events WHERE organization_id=$1 AND event_type=$2`,
      [organizationId, eventType],
    )
  ).rows[0].count as number;
}
