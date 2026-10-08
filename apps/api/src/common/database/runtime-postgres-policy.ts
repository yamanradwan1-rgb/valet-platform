import type { PoolConfig } from "pg";

export const runtimeDatabaseBudgets = {
  acquireMs: 2000,
  lockMs: 2000,
  statementMs: 3000,
  idleTransactionMs: 2000,
  transactionMs: 5000,
  operationMs: 6000,
} as const;

function integer(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback?: number,
): number {
  const raw = environment[name];
  if (raw === undefined && fallback !== undefined) return fallback;
  if (raw === undefined || !/^[1-9]\d{0,5}$/.test(raw)) {
    throw new Error(`Runtime database capacity requires valid ${name}.`);
  }
  return Number(raw);
}

export interface GeneralDatabaseBudgets {
  readonly lockMs: number;
  readonly statementMs: number;
  readonly transactionMs: number;
  readonly idleTransactionMs: number;
}

export function runtimePostgresPolicy(environment: NodeJS.ProcessEnv): {
  readonly config: PoolConfig;
  readonly maxWaiters: number;
  readonly general: GeneralDatabaseBudgets;
} {
  const production = environment.NODE_ENV === "production";
  const max = integer(
    environment,
    "DATABASE_POOL_MAX",
    production ? undefined : 4,
  );
  if (production) {
    const allowed = integer(environment, "DATABASE_ALLOWED_CONNECTIONS");
    const reserved = integer(environment, "DATABASE_RESERVED_CONNECTIONS");
    const instances = integer(environment, "DATABASE_MAX_API_INSTANCES");
    if (max > Math.floor((allowed - reserved) / instances)) {
      throw new Error(
        "Runtime database pool exceeds the supplied capacity envelope.",
      );
    }
  }
  const maxWaiters = integer(
    environment,
    "DATABASE_POOL_MAX_WAITERS",
    Math.min(max * 32, 1024),
  );
  if (max > 100 || maxWaiters > 1024) {
    throw new Error("Runtime database admission capacity is out of bounds.");
  }
  const general = {
    lockMs: integer(
      environment,
      "DATABASE_GENERAL_LOCK_MS",
      production ? undefined : 5000,
    ),
    statementMs: integer(
      environment,
      "DATABASE_GENERAL_STATEMENT_MS",
      production ? undefined : 15_000,
    ),
    transactionMs: integer(
      environment,
      "DATABASE_GENERAL_TRANSACTION_MS",
      production ? undefined : 30_000,
    ),
    idleTransactionMs: integer(
      environment,
      "DATABASE_GENERAL_IDLE_TRANSACTION_MS",
      production ? undefined : 10_000,
    ),
  };
  if (
    general.lockMs > general.statementMs ||
    general.idleTransactionMs > general.transactionMs ||
    general.statementMs >= general.transactionMs
  ) {
    throw new Error(
      "Runtime database general budgets require statement and idle within the transaction ceiling.",
    );
  }
  return {
    maxWaiters,
    general,
    config: {
      max,
      connectionTimeoutMillis: runtimeDatabaseBudgets.acquireMs,
      idleTimeoutMillis: 30_000,
      statement_timeout: runtimeDatabaseBudgets.statementMs,
      lock_timeout: runtimeDatabaseBudgets.lockMs,
      idle_in_transaction_session_timeout:
        runtimeDatabaseBudgets.idleTransactionMs,
      options: `-c transaction_timeout=${runtimeDatabaseBudgets.transactionMs}`,
    },
  };
}
