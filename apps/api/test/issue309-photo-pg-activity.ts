import { performance } from "node:perf_hooks";
import type { Pool, PoolClient } from "pg";

import {
  runtimeDatabaseBudgets,
  runtimePostgresPolicy,
} from "../src/common/database/runtime-postgres-policy";

type PoolOwner = "fixture-admin" | "nest-http" | "photo-fence";

interface BackendLease {
  readonly owner: PoolOwner;
  readonly checkout: number;
  readonly state: "leased" | "released";
}

/** Test-only PostgreSQL backend attribution; does not execute SQL on a lease. */
export class Issue309PhotoPgActivity {
  private readonly backends = new Map<number, BackendLease>();
  private checkout = 0;

  track(pool: Pool, owner: PoolOwner): void {
    const pidOf = (client: PoolClient) =>
      (client as PoolClient & { processID?: number }).processID;
    pool.on("acquire", (client: PoolClient) => {
      const pid = pidOf(client);
      if (pid !== undefined) {
        this.backends.set(pid, { owner, checkout: ++this.checkout, state: "leased" });
      }
    });
    pool.on("release", (_error: Error | undefined, client: PoolClient) => {
      const pid = pidOf(client);
      const prior = pid === undefined ? undefined : this.backends.get(pid);
      if (pid !== undefined && prior?.owner === owner) {
        this.backends.set(pid, { ...prior, state: "released" });
      }
    });
    pool.on("remove", (client: PoolClient) => {
      const pid = pidOf(client);
      if (pid !== undefined && this.backends.get(pid)?.owner === owner) {
        this.backends.delete(pid);
      }
    });
  }

  describe(pid: number): string {
    const lease = this.backends.get(pid);
    return lease === undefined
      ? "unattributed"
      : `${lease.owner}:checkout-${lease.checkout}:${lease.state}`;
  }
}

/** The observation must finish well before either runtime idle watchdog. */
export function issue309IdleObservationBudgetMs(
  environment: NodeJS.ProcessEnv = process.env,
): number {
  const configuredIdleMs = runtimePostgresPolicy(environment).general.idleTransactionMs;
  const shortestIdleMs = Math.min(configuredIdleMs, runtimeDatabaseBudgets.idleTransactionMs);
  const budgetMs = Math.min(1_000, Math.floor(shortestIdleMs / 2));
  if (budgetMs < 1 || budgetMs >= shortestIdleMs) {
    throw new Error("Unsafe Issue309 PostgreSQL idle observation budget.");
  }
  return budgetMs;
}

/** A completed HTTP response may precede the Nest handler's pool release. */
export async function waitForNestPoolToSettle(pool: Pool, budgetMs: number): Promise<void> {
  if (!Number.isSafeInteger(budgetMs) || budgetMs < 1 || budgetMs > 1_000) {
    throw new Error("Invalid Issue309 Nest pool settle budget.");
  }
  const started = performance.now();
  const settled = () => pool.waitingCount === 0 && pool.totalCount === pool.idleCount;
  if (settled()) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(deadline);
      pool.off("release", onRelease);
      pool.off("remove", onRelease);
    };
    const check = () => {
      if (performance.now() - started >= budgetMs) {
        cleanup();
        reject(new Error(`Nest HTTP pool did not settle before watchdog: total=${pool.totalCount}, idle=${pool.idleCount}, waiting=${pool.waitingCount}`));
        return;
      }
      if (!settled()) return;
      cleanup();
      resolve();
    };
    const onRelease = () => queueMicrotask(check);
    const deadline = setTimeout(() => {
      cleanup();
      reject(new Error(`Nest HTTP pool did not settle before watchdog: total=${pool.totalCount}, idle=${pool.idleCount}, waiting=${pool.waitingCount}`));
    }, budgetMs);
    pool.on("release", onRelease);
    pool.on("remove", onRelease);
    check();
  });
}
