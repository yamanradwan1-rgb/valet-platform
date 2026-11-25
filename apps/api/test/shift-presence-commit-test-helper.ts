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
const pendingRequests = new Set<Promise<unknown>>();
export async function abortPresenceCommitBarriers() {
  for (const finish of pendingBarriers) finish("ROLLBACK");
  await Promise.allSettled([...pendingRequests]);
}
export function trackPresenceRaceRequest<T extends Promise<unknown>>(request: T): T {
  pendingRequests.add(request);
  void request.then(
    () => { pendingRequests.delete(request); },
    () => { pendingRequests.delete(request); },
  );
  return request;
}
/** Pause the actual protected transaction immediately before COMMIT, never by sleeping. */
export function presenceCommitBarrier(pool: Pool) {
  let reached!: () => void;
  let failReached!: (error: unknown) => void;
  let finish!: (outcome: CommitOutcome) => void;
  let holderPid: number | undefined;
  const atCommit = new Promise<void>((resolve, reject) => {
    reached = resolve;
    failReached = reject;
  });
  void atCommit.catch(() => undefined);
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
                    try {
                      const observed = await connection.query<{ pid: number }>(
                        "SELECT pg_backend_pid() AS pid",
                      );
                      const pid = observed.rows[0]?.pid;
                      if (!Number.isSafeInteger(pid) || pid === undefined || pid <= 0) {
                        throw new Error("Presence commit barrier requires a real backend PID.");
                      }
                      holderPid = pid;
                    } catch (error) {
                      failReached(error);
                      throw error;
                    }
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
  return {
    pool: gated,
    atCommit,
    finish,
    trackFirst<T>(request: Promise<T>): Promise<T> {
      const tracked = trackPresenceRaceRequest(request);
      void tracked.then(
        () => {
          if (holderPid === undefined) failReached(new Error("Presence operation settled before its commit barrier."));
        },
        (error: unknown) => { if (holderPid === undefined) failReached(error); },
      );
      return tracked;
    },
    holderPid() {
      if (holderPid === undefined) {
        throw new Error("Presence commit barrier has not reached its PostgreSQL transaction.");
      }
      return holderPid;
    },
  };
}

export async function observePresenceCommandWait(
  db: PresenceServerTestContext,
  holderPid?: number,
  waiterRole: "runtime" | "management" = "runtime",
  waiterPid?: number,
) {
  const role = waiterRole === "management" ? "vaylet_management_writer" : db.runtimeRole;
  if (waiterRole === "management" && holderPid === undefined) {
    throw new Error("Management race witness requires an exact held backend PID.");
  }
  const deadline = Date.now() + (holderPid === undefined ? 10_000 : 2_000);
  while (Date.now() < deadline) {
    const result = await db.adminPool.query(
      holderPid === undefined
        ? `SELECT pid FROM pg_stat_activity
           WHERE datname=$1 AND usename=$2
             AND cardinality(pg_blocking_pids(pid)) > 0`
        : `SELECT waiter.pid FROM pg_stat_activity AS waiter
           JOIN pg_stat_activity AS holder ON holder.pid=$3
             AND holder.datname=waiter.datname
           WHERE waiter.datname=$1 AND waiter.usename=$2
             AND waiter.pid<>$3
             AND ($4::int IS NULL OR waiter.pid=$4)
             AND $3::int = ANY(pg_blocking_pids(waiter.pid))`,
      holderPid === undefined
        ? [db.databaseName, role]
        : [db.databaseName, role, holderPid, waiterPid ?? null],
    );
    if (result.rowCount !== 0) return;
    await setImmediate();
  }
  throw new Error(
    `Expected current-authority/configuration PostgreSQL barrier${holderPid === undefined ? "" : ` behind PID ${holderPid}`}`,
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
