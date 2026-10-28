import { runtimeDatabaseBudgets } from "./runtime-postgres-policy";
import { configureGeneralLease, ownPostgresLease } from "./postgres-lease";
import { boundPostgresQueries } from "./bounded-postgres-query";
import type { GeneralDatabaseBudgets } from "./runtime-postgres-policy";
import { performance } from "node:perf_hooks";
import type { Pool, PoolClient } from "pg";
import {
  createPostgresLifecycleMeasurements,
  beginAcquisitionDiagnostics,
  readLifecycleDiagnostics,
  type PostgresLifecycleMeasurements,
} from "./postgres-lifecycle-diagnostics";

import {
  remainingDatabaseOperationMs,
  RuntimeDatabaseUnavailableError,
} from "./runtime-database-deadline";

import { isPostgresAcquisitionTimeout } from "./database-failure-reason";

type ConnectCallback = (
  error: Error | undefined,
  client: PoolClient | undefined,
  release: ((error?: Error | boolean) => void) | undefined,
) => void;

export interface RuntimePoolMeasurements extends PostgresLifecycleMeasurements {
  acquisitions: number;
  acquisitionsOver200Ms: number;
  rejected: number;
  acquisitionMs: number;
  nativeAcquisitionMs: number;
  nativeAcquisitionAttempts: number;
  peakAdmitted: number;
  peakWaiting: number;
  peakActive: number;
  peakIdle: number;
  peakLeased: number;
  leaseCompletions: number;
  leaseMs: number;
  readonly leaseBuckets: number[];
  readonly queryCounts: number[];
  readonly queryMs: number[];
  failures: number;
  initializationFailures: number;
  poolErrors: number;
  clientErrors: number;
  acquisitionTimeouts: number;
  connectionFailures: number;
  leaseSetupFailures: number;
  expiredAcquisitions: number;
  releaseFailures: number;
  leaseExpirations: number;
  queryTimeouts: number;
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
  general: GeneralDatabaseBudgets,
): Pool {
  const connect = pool.connect.bind(pool);
  let admitted = 0;
  const disposals = new Set<() => void>();
  const end = pool.end.bind(pool);
  let closing = false;
  pool.end = ((callback?: (error?: Error) => void) => {
    closing = true;
    for (const dispose of disposals) dispose();
    const result = end();
    if (callback) {
      void result.then(() => callback(), callback);
      return;
    }
    return result;
  }) as Pool["end"];
  const measurements: RuntimePoolMeasurements = {
    ...createPostgresLifecycleMeasurements(),
    acquisitions: 0,
    acquisitionsOver200Ms: 0,
    rejected: 0,
    acquisitionMs: 0,
    nativeAcquisitionMs: 0,
    nativeAcquisitionAttempts: 0,
    peakAdmitted: 0,
    peakWaiting: 0,
    peakActive: 0,
    peakIdle: 0,
    peakLeased: 0,
    leaseCompletions: 0,
    leaseMs: 0,
    leaseBuckets: [0, 0, 0, 0, 0, 0, 0],
    queryCounts: [0, 0, 0, 0],
    queryMs: [0, 0, 0, 0],
    failures: 0,
    initializationFailures: 0,
    poolErrors: 0,
    clientErrors: 0,
    acquisitionTimeouts: 0,
    connectionFailures: 0,
    leaseSetupFailures: 0,
    expiredAcquisitions: 0,
    releaseFailures: 0,
    leaseExpirations: 0,
    queryTimeouts: 0,
    acquisitionBuckets: [0, 0, 0, 0, 0, 0],
    lockTimeouts: 0,
    statementTimeouts: 0,
    transactionTimeouts: 0,
  };
  const observePeaks = () => {
    measurements.peakActive = Math.max(
      measurements.peakActive,
      pool.totalCount - pool.idleCount,
    );
    measurements.peakIdle = Math.max(measurements.peakIdle, pool.idleCount);
    measurements.peakLeased = Math.max(measurements.peakLeased, disposals.size);
  };
  pool.on("error", () => {
    measurements.poolErrors += 1;
    measurements.failures += 1;
  });
  pool.on("connect", (client) => {
    // pg emits a client error on server transaction termination, even while leased.
    client.on("error", () => {
      measurements.clientErrors += 1;
      measurements.failures += 1;
    });
    boundPostgresQueries(client, general, measurements);
  });
  pool.connect = ((callback?: ConnectCallback) => {
    const started = performance.now();
    const finishAcquisition = beginAcquisitionDiagnostics(measurements);
    const acquire = async () => {
      remainingDatabaseOperationMs();
      if (closing) throw new RuntimeDatabaseUnavailableError("POOL_CLOSING");
      if (admitted >= max + maxWaiters) {
        measurements.rejected += 1;
        throw new RuntimeDatabaseUnavailableError("QUEUE_FULL");
      }
      admitted += 1;
      measurements.peakAdmitted = Math.max(measurements.peakAdmitted, admitted);
      let client: PoolClient;
      measurements.nativeAcquisitionAttempts += 1;
      try {
        const pending = connect();
        measurements.peakWaiting = Math.max(
          measurements.peakWaiting,
          pool.waitingCount,
        );
        client = await pending;
      } catch (error) {
        admitted -= 1;
        measurements.failures += 1;
        const timeout = isPostgresAcquisitionTimeout(error);
        if (timeout) measurements.acquisitionTimeouts += 1;
        else measurements.connectionFailures += 1;
        throw new RuntimeDatabaseUnavailableError(
          timeout ? "ACQUISITION_TIMEOUT" : "CONNECT_ERROR",
        );
      } finally {
        measurements.nativeAcquisitionMs += performance.now() - started;
      }
      try {
        if (closing) throw new RuntimeDatabaseUnavailableError("POOL_CLOSING");
        remainingDatabaseOperationMs();
      } catch (error) {
        admitted -= 1;
        measurements.expiredAcquisitions += 1;
        client.release(true);
        throw error;
      }
      const dispose = ownPostgresLease(
        client,
        general,
        () => {
          admitted -= 1;
          disposals.delete(dispose);
        },
        measurements,
      );
      disposals.add(dispose);
      observePeaks();
      try {
        const acquisitionRemaining = Math.floor(
          runtimeDatabaseBudgets.acquireMs - (performance.now() - started),
        );
        if (acquisitionRemaining <= 0) {
          measurements.acquisitionTimeouts += 1;
          throw new RuntimeDatabaseUnavailableError("ACQUISITION_TIMEOUT");
        }
        await configureGeneralLease(client, general, acquisitionRemaining);
        if (closing) throw new RuntimeDatabaseUnavailableError("POOL_CLOSING");
        remainingDatabaseOperationMs();
      } catch (error) {
        measurements.leaseSetupFailures += 1;
        if (
          error instanceof RuntimeDatabaseUnavailableError &&
          error.reason === "QUERY_TIMEOUT"
        )
          measurements.acquisitionTimeouts += 1;
        dispose();
        throw error;
      }
      measurements.acquisitions += 1;
      const waitMs = performance.now() - started;
      measurements.acquisitionMs += waitMs;
      if (waitMs > 200) measurements.acquisitionsOver200Ms += 1;
      const bucket = [5, 25, 100, 500, 1000, 2000].findIndex(
        (ceiling) => waitMs <= ceiling,
      );
      measurements.acquisitionBuckets[bucket < 0 ? 5 : bucket]! += 1;
      return client;
    };
    const promise = acquire().then(
      (client) => {
        finishAcquisition();
        return client;
      },
      (error: unknown) => {
        finishAcquisition(error);
        throw error;
      },
    );
    if (callback === undefined) return promise;
    void promise.then(
      (client) => callback(undefined, client, client.release.bind(client)),
      (error: unknown) =>
        callback(
          error instanceof RuntimeDatabaseUnavailableError
            ? error
            : new RuntimeDatabaseUnavailableError(),
          undefined,
          undefined,
        ),
    );
  }) as Pool["connect"];
  runtimePoolMeasurements.set(pool, measurements);
  runtimePoolState.set(pool, () => {
    observePeaks();
    return {
      configuredMax: max,
      queueCapacity: maxWaiters,
      admitted,
      leased: disposals.size,
      acquiring: admitted - disposals.size,
    };
  });
  return pool;
}

export const runtimePoolMeasurements = new WeakMap<
  Pool,
  RuntimePoolMeasurements
>();

const runtimePoolState = new WeakMap<
  Pool,
  () => {
    configuredMax: number;
    queueCapacity: number;
    admitted: number;
    leased: number;
    acquiring: number;
  }
>();

export function runtimePoolSnapshot(pool: Pool) {
  const state = runtimePoolState.get(pool)?.();
  const measurements = runtimePoolMeasurements.get(pool);
  return {
    ...measurements,
    ...(measurements ? readLifecycleDiagnostics(measurements) : {}),
    ...state,
    active: pool.totalCount - pool.idleCount,
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}
