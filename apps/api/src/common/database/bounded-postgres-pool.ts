import { performance } from "node:perf_hooks";
import type { Pool, PoolClient } from "pg";

import {
  remainingDatabaseOperationMs,
  trackDatabaseOperationClient,
  RuntimeDatabaseUnavailableError,
} from "./runtime-database-deadline";

type ConnectCallback = (
  error: Error | undefined,
  client: PoolClient | undefined,
  release: ((error?: Error | boolean) => void) | undefined,
) => void;

export interface RuntimePoolMeasurements {
  acquisitions: number;
  rejected: number;
  acquisitionMs: number;
  failures: number;
  readonly acquisitionBuckets: number[];
  lockTimeouts: number;
  statementTimeouts: number;
  transactionTimeouts: number;
}

// Admission is local resource control only. All security accounting remains in DB.
export function boundPostgresPool(
  pool: Pool,
  max: number,
  maxWaiters: number,
): Pool {
  const connect = pool.connect.bind(pool);
  let admitted = 0;
  const measurements: RuntimePoolMeasurements = {
    acquisitions: 0,
    rejected: 0,
    acquisitionMs: 0,
    failures: 0,
    acquisitionBuckets: [0, 0, 0, 0, 0, 0],
    lockTimeouts: 0,
    statementTimeouts: 0,
    transactionTimeouts: 0,
  };
  pool.on("error", () => {
    measurements.failures += 1;
  });
  pool.on("connect", (client) => {
    // pg emits a client error on server transaction termination, even while leased.
    client.on("error", () => {
      measurements.failures += 1;
    });
    const query = client.query.bind(client);
    client.query = ((...args: unknown[]) => {
      const config =
        typeof args[0] === "string"
          ? { text: args[0] }
          : (args[0] as { text?: string });
      const text = config?.text;
      const remaining =
        text === "ROLLBACK" ? 3500 : remainingDatabaseOperationMs();
      if (text !== undefined) {
        args[0] = { ...config, query_timeout: Math.min(3500, remaining) };
      }
      const recordFailure = (error: unknown) => {
        const code = (error as { code?: string })?.code;
        if (code === "55P03") measurements.lockTimeouts += 1;
        if (code === "57014") measurements.statementTimeouts += 1;
        if (code === "25P03" || code === "25P04")
          measurements.transactionTimeouts += 1;
      };
      const callback = args.at(-1);
      if (typeof callback === "function") {
        args[args.length - 1] = (error: unknown, result: unknown) => {
          if (error !== null && error !== undefined) recordFailure(error);
          if (
            (error as { message?: string })?.message === "Query read timeout"
          ) {
            void client.end().catch(() => undefined);
            callback(new RuntimeDatabaseUnavailableError(), result);
          } else callback(error, result);
        };
      }
      const result = Reflect.apply(query, client, args);
      if (result instanceof Promise) {
        return result.catch(async (error: unknown) => {
          recordFailure(error);
          if (
            (error as { message?: string })?.message === "Query read timeout"
          ) {
            // Server-side deadlines stop SQL; a lost COMMIT response remains unknown.
            await client.end().catch(() => undefined);
            throw new RuntimeDatabaseUnavailableError();
          }
          throw error;
        });
      }
      return result;
    }) as PoolClient["query"];
  });
  pool.connect = ((callback?: ConnectCallback) => {
    const started = performance.now();
    const acquire = async () => {
      remainingDatabaseOperationMs();
      if (admitted >= max + maxWaiters) {
        measurements.rejected += 1;
        throw new RuntimeDatabaseUnavailableError();
      }
      admitted += 1;
      let client: PoolClient;
      try {
        client = await connect();
      } catch {
        admitted -= 1;
        measurements.failures += 1;
        throw new RuntimeDatabaseUnavailableError();
      }
      measurements.acquisitions += 1;
      const waitMs = performance.now() - started;
      measurements.acquisitionMs += waitMs;
      const bucket = [5, 25, 100, 500, 1000, 2000].findIndex(
        (ceiling) => waitMs <= ceiling,
      );
      measurements.acquisitionBuckets[bucket < 0 ? 5 : bucket]! += 1;
      try {
        remainingDatabaseOperationMs();
      } catch (error) {
        admitted -= 1;
        client.release(true);
        throw error;
      }
      const release = client.release.bind(client);
      let released = false;
      let untrack = () => {};
      client.release = (error?: Error | boolean) => {
        if (released) return;
        released = true;
        admitted -= 1;
        untrack();
        release(error);
      };
      untrack = trackDatabaseOperationClient({
        end: async () => {
          // Pool disposal also ends the connection; late finally blocks must be harmless.
          client.release(true);
        },
      });
      return client;
    };
    const promise = acquire();
    if (callback === undefined) return promise;
    void promise.then(
      (client) => callback(undefined, client, client.release.bind(client)),
      () =>
        callback(new RuntimeDatabaseUnavailableError(), undefined, undefined),
    );
  }) as Pool["connect"];
  runtimePoolMeasurements.set(pool, measurements);
  return pool;
}

export const runtimePoolMeasurements = new WeakMap<
  Pool,
  RuntimePoolMeasurements
>();

export function runtimePoolSnapshot(pool: Pool) {
  return {
    ...runtimePoolMeasurements.get(pool),
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}
