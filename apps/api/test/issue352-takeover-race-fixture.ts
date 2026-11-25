import type { Pool } from "pg";

import type { Issue352TakeoverTestContext } from "./issue352-takeover-test-context";
import { waitForPostgresBlockingEdge } from "./postgres-lock-observer";

// An exact backend identity is recorded only while this fixture has paused
// that backend immediately before COMMIT. Scope the ledger to the original
// Pool object; unrelated fixtures (even on similarly named databases) do not
// share observed holders.
const heldCommitBackends = new WeakMap<Pool, Set<number>>();

/** Holds the actual PostgreSQL transaction after its writes, immediately before COMMIT. */
export function holdTakeoverCommit(
  pool: Pool,
  mode: "commit" | "rollback" | "lost-response" = "commit",
) {
  let backends = heldCommitBackends.get(pool);
  if (backends === undefined) {
    backends = new Set<number>();
    heldCommitBackends.set(pool, backends);
  }
  const heldBackends = backends;
  let entered!: () => void;
  let release!: () => void;
  const held = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Issue #352 transaction did not reach COMMIT.")),
      15_000,
    );
    timeout.unref();
    entered = () => {
      clearTimeout(timeout);
      resolve();
    };
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const wrapped = new Proxy(pool, {
    get(target, key) {
      if (key === "connect") {
        return async () => {
          const connection = await target.connect();
          return new Proxy(connection, {
            get(client, property) {
              if (property === "query") {
                return async (...args: unknown[]) => {
                  if (args[0] === "COMMIT") {
                    const backend = await client.query<{ pid: number }>(
                      "SELECT pg_backend_pid() AS pid",
                    );
                    const backendPid = backend.rows[0]?.pid;
                    if (backendPid === undefined ||
                        !Number.isSafeInteger(backendPid) || backendPid <= 0) {
                      throw new Error("Issue #352 commit gate lost its backend PID.");
                    }
                    heldBackends.add(backendPid);
                    entered();
                    try {
                      await gate;
                      if (mode === "rollback") {
                        throw new Error("Test-controlled pre-COMMIT failure.");
                      }
                      const outcome = await Reflect.apply(client.query, client, args);
                      if (mode === "lost-response") {
                        throw new Error("Test-controlled lost response after COMMIT.");
                      }
                      return outcome;
                    } finally {
                      heldBackends.delete(backendPid);
                    }
                  }
                  return Reflect.apply(client.query, client, args);
                };
              }
              const value = Reflect.get(client, property);
              return typeof value === "function" ? value.bind(client) : value;
            },
          });
        };
      }
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { pool: wrapped, held, release };
}

export async function waitForIssue352DatabaseLock(
  context: Issue352TakeoverTestContext,
  explicitBlockerPid?: number,
) {
  let blockerPid = explicitBlockerPid;
  if (blockerPid === undefined) {
    const knownHolders = heldCommitBackends.get(context.runtimePool as Pool);
    if (knownHolders?.size !== 1) {
      throw new Error("Expected one exact Issue #352 pre-commit backend holder.");
    }
    blockerPid = [...knownHolders][0]!;
  }
  await waitForPostgresBlockingEdge(context.adminPool, { blockerPid });
}
