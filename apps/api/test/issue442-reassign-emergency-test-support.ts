import { setTimeout as pause } from "node:timers/promises";

import type { Pool } from "pg";
import { expect } from "vitest";

import { createEmergencyTakeoverCommandExecutor } from "../src/modules/dispatch/emergency-takeover-command";
import { createReassignTaskCommandExecutor } from "../src/modules/dispatch/reassign-task-command";
import type {
  RaceContext,
  ReassignEmergencyCase,
} from "./issue442-reassign-emergency-fixture";

type Deferred<T> = {
  readonly promise: Promise<T>;
  resolve(value: T): void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Deterministically pause only a real executor's own transaction connection. */
export function pauseWriter(
  pool: Pool,
  point:
    | "REASSIGN_TASK_UPDATE"
    | "EMERGENCY_TASK_LOCK"
    | "EMERGENCY_CREDENTIAL"
    | "BEFORE_COMMIT",
  failAtCommit = false,
) {
  const entered = deferred<number>();
  const unblock = deferred<void>();
  let paused = false;
  const matches = (sql: string): boolean => {
    if (point === "REASSIGN_TASK_UPDATE")
      return /^\s*UPDATE\s+tasks\b/i.test(sql);
    if (point === "EMERGENCY_TASK_LOCK") {
      return /\bFROM\s+tasks\s+WHERE\s+id\s*=\s*\$1[\s\S]*FOR\s+UPDATE/i.test(
        sql,
      );
    }
    if (point === "EMERGENCY_CREDENTIAL") {
      return /\bFROM\s+staff_auth_sessions\s+AS\s+session[\s\S]*FOR\s+UPDATE\s+OF\s+session/i.test(
        sql,
      );
    }
    return sql === "COMMIT";
  };
  const wrapped = new Proxy(pool, {
    get(target, key) {
      if (key === "connect") {
        return async () => {
          const client = await target.connect();
          const pid = (
            await client.query<{ pid: number }>(
              "SELECT pg_backend_pid() AS pid",
            )
          ).rows[0]!.pid;
          return new Proxy(client, {
            get(connection, property) {
              if (property === "query") {
                return async (...args: unknown[]) => {
                  const sql = args[0];
                  if (!paused && typeof sql === "string" && matches(sql)) {
                    paused = true;
                    entered.resolve(pid);
                    await unblock.promise;
                    if (failAtCommit) {
                      throw new Error(
                        "Issue442 test-controlled pre-COMMIT rollback.",
                      );
                    }
                  }
                  return Reflect.apply(connection.query, connection, args);
                };
              }
              const value = Reflect.get(connection, property);
              return typeof value === "function"
                ? value.bind(connection)
                : value;
            },
          });
        };
      }
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as Pool;
  return {
    pool: wrapped,
    async held(): Promise<number> {
      return new Promise<number>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`Writer never reached ${point}`)),
          10_000,
        );
        timeout.unref();
        entered.promise.then(
          (pid) => {
            clearTimeout(timeout);
            resolve(pid);
          },
          (error: unknown) => {
            clearTimeout(timeout);
            reject(error);
          },
        );
      });
    },
    release() {
      unblock.resolve(undefined);
    },
  };
}

export function executeReassign(
  context: RaceContext,
  input: ReassignEmergencyCase,
  pool = context.runtimePool,
) {
  return createReassignTaskCommandExecutor(pool)(input.reassign);
}

export function executeEmergency(
  context: RaceContext,
  input: ReassignEmergencyCase,
  pool = context.runtimePool,
) {
  return createEmergencyTakeoverCommandExecutor(pool)(input.emergency);
}

/** Check the exact dependency; do not accept unrelated PostgreSQL lock waiters. */
export async function expectWait(
  context: RaceContext,
  waiter: number,
  blocker: number,
) {
  for (let attempt = 0; attempt < 250; attempt += 1) {
    const result = await context.adminPool.query<{ blocked: boolean }>(
      "SELECT $2::integer=ANY(pg_blocking_pids($1::integer)) AS blocked",
      [waiter, blocker],
    );
    if (result.rows[0]?.blocked) return;
    await pause(20);
  }
  throw new Error(`Expected backend ${waiter} blocked on ${blocker}.`);
}

export async function expectBlockedBy(context: RaceContext, blocker: number) {
  for (let attempt = 0; attempt < 250; attempt += 1) {
    const result = await context.adminPool.query<{ pid: number }>(
      `SELECT pid FROM pg_stat_activity
       WHERE datname=current_database() AND pid<>pg_backend_pid()
         AND $1::integer=ANY(pg_blocking_pids(pid))
       ORDER BY pid LIMIT 1`,
      [blocker],
    );
    if (result.rows[0]) return result.rows[0].pid;
    await pause(20);
  }
  throw new Error(`Expected real database writer blocked by PID ${blocker}.`);
}

export async function settled<T>(
  operation: Promise<T>,
): Promise<PromiseSettledResult<T>> {
  return operation.then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason: unknown) => ({ status: "rejected" as const, reason }),
  );
}

/** Apply a test-local lock budget inside BEGIN; rollback resets it automatically. */
export function withLocalLockTimeout(pool: Pool, milliseconds: number): Pool {
  if (
    !Number.isInteger(milliseconds) ||
    milliseconds < 1 ||
    milliseconds > 1000
  ) {
    throw new Error("Test lock timeout must be 1–1000ms.");
  }
  return new Proxy(pool, {
    get(target, key) {
      if (key === "connect") {
        return async () => {
          const client = await target.connect();
          return new Proxy(client, {
            get(connection, property) {
              if (property === "query") {
                return async (...args: unknown[]) => {
                  const result = await Reflect.apply(
                    connection.query,
                    connection,
                    args,
                  );
                  if (args[0] === "BEGIN") {
                    await connection.query(
                      `SET LOCAL lock_timeout = '${milliseconds}ms'`,
                    );
                  }
                  return result;
                };
              }
              const value = Reflect.get(connection, property);
              return typeof value === "function"
                ? value.bind(connection)
                : value;
            },
          });
        };
      }
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as Pool;
}

export async function deadlocks(context: RaceContext) {
  await context.adminPool.query("SELECT pg_stat_clear_snapshot()");
  const result = await context.adminPool.query<{ deadlocks: string }>(
    "SELECT deadlocks::text FROM pg_stat_database WHERE datname=current_database()",
  );
  return Number(result.rows[0]?.deadlocks ?? 0);
}

export async function assertNoDeadlocks(context: RaceContext, prior: number) {
  let maximum = prior;
  for (let i = 0; i < 20; i += 1) {
    maximum = Math.max(maximum, await deadlocks(context));
    await pause(50);
  }
  expect(maximum - prior).toBe(0);
}

/** Denial snapshots and successful writer evidence are checked before retry. */
export async function expectReassignResult(
  context: RaceContext,
  input: ReassignEmergencyCase,
  before: Awaited<ReturnType<RaceContext["snapshot"]>>,
) {
  const after = await context.snapshot(input.taskId);
  expect(after).toMatchObject({
    task_status: "ASSIGNED",
    task_assignee: input.replacementMembershipId,
    task_version: before.task_version + 1,
    session_state: before.session_state,
    session_version: before.session_version,
    audit_count: before.audit_count + 1,
    dispatch_count: before.dispatch_count + 1,
    custody_count: before.custody_count,
    handoff_count: before.handoff_count,
    tracking_count: before.tracking_count,
  });
}
