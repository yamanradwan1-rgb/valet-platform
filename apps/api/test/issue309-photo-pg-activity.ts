import type { Pool, PoolClient } from "pg";

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

/** A completed HTTP response may precede the Nest handler's pool release. */
export async function waitForNestPoolToSettle(pool: Pool): Promise<void> {
  const settled = () => pool.waitingCount === 0 && pool.totalCount === pool.idleCount;
  if (settled()) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(deadline);
      pool.off("release", onRelease);
      pool.off("remove", onRelease);
    };
    const check = () => {
      if (!settled()) return;
      cleanup();
      resolve();
    };
    const onRelease = () => queueMicrotask(check);
    const deadline = setTimeout(() => {
      cleanup();
      reject(new Error(`Nest HTTP pool did not settle: total=${pool.totalCount}, idle=${pool.idleCount}, waiting=${pool.waitingCount}`));
    }, 10_000);
    pool.on("release", onRelease);
    pool.on("remove", onRelease);
    check();
  });
}
