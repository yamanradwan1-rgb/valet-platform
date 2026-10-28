import { performance } from "node:perf_hooks";
import type { PoolClient } from "pg";
import {
  databaseOperationIndex,
  databaseOperations,
} from "../observability/database-operation-context";
import { databaseFailureReason } from "./database-failure-reason";

// OWNED means no query is outstanding. RTT includes driver/network scheduling.
export const postgresPhases = [
  "OWNED",
  "SETUP",
  "WORK",
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
  "RESET",
] as const;
export const resetFailureReasons = [
  "ABORTED_TRANSACTION",
  "QUERY_TIMEOUT",
  "LOCK_TIMEOUT",
  "STATEMENT_TIMEOUT",
  "TRANSACTION_TIMEOUT",
  "CONNECTION",
  "OPERATION_DEADLINE",
  "OTHER",
] as const;

export interface PostgresLifecycleMeasurements {
  phaseCounts: number[];
  phaseMs: number[];
  phaseMaxMs: number[];
  operationLeases: number[];
  operationLeaseMs: number[];
  operationLeaseMaxMs: number[];
  operationAcquisitions: number[];
  operationAcquisitionMs: number[];
  operationAcquisitionTimeouts: number[];
  resetFailureReasons: number[];
  resetFailuresAfterDisposal: number;
  resetsInterrupted: number;
}

export function createPostgresLifecycleMeasurements(): PostgresLifecycleMeasurements {
  return {
    phaseCounts: postgresPhases.map(() => 0),
    phaseMs: postgresPhases.map(() => 0),
    phaseMaxMs: postgresPhases.map(() => 0),
    operationLeases: databaseOperations.map(() => 0),
    operationLeaseMs: databaseOperations.map(() => 0),
    operationLeaseMaxMs: databaseOperations.map(() => 0),
    operationAcquisitions: databaseOperations.map(() => 0),
    operationAcquisitionMs: databaseOperations.map(() => 0),
    operationAcquisitionTimeouts: databaseOperations.map(() => 0),
    resetFailureReasons: resetFailureReasons.map(() => 0),
    resetFailuresAfterDisposal: 0,
    resetsInterrupted: 0,
  };
}

export function beginAcquisitionDiagnostics(
  metrics: PostgresLifecycleMeasurements,
) {
  const operation = databaseOperationIndex();
  const started = performance.now();
  return (error?: unknown) => {
    metrics.operationAcquisitions[operation]! += 1;
    metrics.operationAcquisitionMs[operation]! += performance.now() - started;
    if (databaseFailureReason(error) === "ACQUISITION_TIMEOUT") {
      metrics.operationAcquisitionTimeouts[operation]! += 1;
    }
  };
}

interface Lease {
  readonly started: number;
  readonly operation: number;
  readonly queries: Map<object, { phase: number; started: number }>;
  resetting: boolean;
  resetSettled: boolean;
  finished: boolean;
}
const clientLeases = new WeakMap<PoolClient, Lease>();
const activeLeases = new WeakMap<PostgresLifecycleMeasurements, Set<Lease>>();

export function beginLeaseDiagnostics(
  client: PoolClient,
  metrics: PostgresLifecycleMeasurements,
) {
  const lease: Lease = {
    started: performance.now(),
    operation: databaseOperationIndex(),
    queries: new Map(),
    resetting: false,
    resetSettled: false,
    finished: false,
  };
  clientLeases.set(client, lease);
  let active = activeLeases.get(metrics);
  if (!active) activeLeases.set(metrics, (active = new Set()));
  active.add(lease);
  metrics.operationLeases[lease.operation]! += 1;
  return {
    resetStarted: () => {
      lease.resetting = true;
    },
    resetFailed: (error: unknown) => {
      lease.resetSettled = true;
      metrics.resetFailureReasons[resetFailureIndex(error)]! += 1;
      if (lease.finished) metrics.resetFailuresAfterDisposal += 1;
    },
    finish: (destroy: boolean) => {
      if (lease.finished) return;
      lease.finished = true;
      if (destroy && lease.resetting && !lease.resetSettled)
        metrics.resetsInterrupted += 1;
      const elapsed = performance.now() - lease.started;
      metrics.operationLeaseMs[lease.operation]! += elapsed;
      metrics.operationLeaseMaxMs[lease.operation] = Math.max(
        metrics.operationLeaseMaxMs[lease.operation]!,
        elapsed,
      );
      active.delete(lease);
      if (clientLeases.get(client) === lease) clientLeases.delete(client);
    },
  };
}

function resetFailureIndex(error: unknown): number {
  if ((error as { code?: unknown } | null)?.code === "25P02") return 0;
  const reason = databaseFailureReason(error);
  if (reason === "QUERY_TIMEOUT") return 1;
  if (reason === "LOCK_TIMEOUT") return 2;
  if (reason === "STATEMENT_TIMEOUT") return 3;
  if (reason === "TRANSACTION_TIMEOUT" || reason === "IDLE_TRANSACTION_TIMEOUT")
    return 4;
  if (reason === "OPERATION_DEADLINE") return 6;
  if (reason === "DATABASE_UNAVAILABLE" || reason === "CONNECT_ERROR") return 5;
  return 7;
}

function queryPhase(text: string | undefined): number {
  if (text?.startsWith("SELECT set_config('statement_timeout'")) return 1;
  if (text?.startsWith("RESET statement_timeout;")) return 6;
  const control = /^\s*(BEGIN|COMMIT|ROLLBACK)\b/i
    .exec(text ?? "")?.[1]
    ?.toUpperCase();
  return control === "BEGIN"
    ? 3
    : control === "COMMIT"
      ? 4
      : control === "ROLLBACK"
        ? 5
        : 2;
}

export function beginLifecycleQuery(
  client: PoolClient,
  text: string | undefined,
  metrics: PostgresLifecycleMeasurements,
) {
  const phase = queryPhase(text);
  const started = performance.now();
  const lease = clientLeases.get(client);
  const key = {};
  lease?.queries.set(key, { phase, started });
  metrics.phaseCounts[phase]! += 1;
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    lease?.queries.delete(key);
    const elapsed = performance.now() - started;
    metrics.phaseMs[phase]! += elapsed;
    metrics.phaseMaxMs[phase] = Math.max(metrics.phaseMaxMs[phase]!, elapsed);
  };
}

export function readLifecycleDiagnostics(
  metrics: PostgresLifecycleMeasurements,
) {
  const activeByPhase = postgresPhases.map(() => 0);
  const oldestLeaseByPhaseMs = postgresPhases.map(() => 0);
  const oldestQueryByPhaseMs = postgresPhases.map(() => 0);
  const activeByOperation = databaseOperations.map(() => 0);
  const now = performance.now();
  for (const lease of activeLeases.get(metrics) ?? []) {
    // pg serializes submitted queries. Attribute ownership to the oldest one.
    const query = lease.queries.values().next().value;
    const phase = query?.phase ?? (lease.resetting ? 6 : 0);
    activeByPhase[phase]! += 1;
    activeByOperation[lease.operation]! += 1;
    oldestLeaseByPhaseMs[phase] = Math.max(
      oldestLeaseByPhaseMs[phase]!,
      now - lease.started,
    );
    if (query)
      oldestQueryByPhaseMs[phase] = Math.max(
        oldestQueryByPhaseMs[phase]!,
        now - query.started,
      );
  }
  return {
    activeByPhase,
    oldestLeaseByPhaseMs,
    oldestQueryByPhaseMs,
    activeByOperation,
  };
}
