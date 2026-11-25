import type { Client, Pool } from "pg";
import type { StaffShiftForceEndTestFixture } from "./staff-shift-force-end-test-fixture";
import { waitForStaffRaceBlockingTree } from "./staff-race-lock-observer";

/** Pause the real executor at COMMIT while its actual PostgreSQL locks remain held. */
export function holdForceEndTestCommit(pool: Pool, rollback = false) {
  let heldBackendPid: number | undefined;
  let reached = false;
  let entered!: () => void;
  let failHeld!: (error: unknown) => void;
  let release!: () => void;
  const held = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Executor did not reach the commit barrier.")),
      10_000,
    );
    timeout.unref();
    entered = () => {
      reached = true;
      clearTimeout(timeout);
      resolve();
    };
    failHeld = (error) => {
      clearTimeout(timeout);
      reject(error);
    };
  });
  void held.catch(() => undefined);
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let released = false;
  const releaseOnce = () => {
    if (released) return;
    released = true;
    release();
  };
  const wrapped = new Proxy(pool, {
    get(target, key) {
      if (key === "connect")
        return async () => {
          const client = await target.connect();
          return new Proxy(client, {
            get(connection, property) {
              if (property === "query")
                return async (...args: unknown[]) => {
                  if (args[0] === "COMMIT") {
                    const result = await connection.query<{ pid: number }>(
                      "SELECT pg_backend_pid() AS pid",
                    );
                    const pid = result.rows[0]?.pid;
                    if (pid === undefined || !Number.isSafeInteger(pid) || pid <= 0)
                      throw new Error("Cannot identify Force End commit barrier backend.");
                    heldBackendPid = pid;
                    entered();
                    try {
                      await gate;
                      if (rollback)
                        throw new Error("Test-controlled transaction rollback.");
                    } finally {
                      heldBackendPid = undefined;
                    }
                  }
                  return Reflect.apply(connection.query, connection, args);
                };
              const value = Reflect.get(connection, property);
              return typeof value === "function"
                ? value.bind(connection)
                : value;
            },
          });
        };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return {
    pool: wrapped,
    held,
    release: releaseOnce,
    trackFirst<T>(request: Promise<T>): Promise<T> {
      void request.then(
        () => {
          if (!reached) failHeld(new Error("Executor settled before the commit barrier."));
        },
        (error: unknown) => {
          if (!reached) failHeld(error);
        },
      );
      return request;
    },
    get blockerPid() {
      if (heldBackendPid === undefined)
        throw new Error("Force End commit barrier is not currently held.");
      return heldBackendPid;
    },
  };
}

export async function waitForceEndTestBlocked(
  fixture: StaffShiftForceEndTestFixture,
  blocker: Pick<Client, "query"> | { readonly blockerPid: number },
  count = 1,
) {
  await waitForStaffRaceBlockingTree(
    fixture.databasePool(),
    "blockerPid" in blocker ? blocker.blockerPid : blocker,
    count,
  );
}
