import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

import { runtimeDatabaseBudgets } from "./runtime-postgres-policy";

interface OperationDeadline {
  readonly at: number;
  readonly clients: Set<{ end(): Promise<void> }>;
}

const deadlines = new AsyncLocalStorage<OperationDeadline>();

export class RuntimeDatabaseUnavailableError extends Error {
  readonly code = "INTERNAL_ERROR";

  constructor() {
    super("Service temporarily unavailable.");
  }
}

export function withDatabaseOperationDeadline<T>(
  action: () => Promise<T>,
): Promise<T> {
  const scope: OperationDeadline = {
    at: performance.now() + runtimeDatabaseBudgets.operationMs,
    clients: new Set(),
  };
  return deadlines.run(
    scope,
    () =>
      new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          // pg.end destroys an active query connection. Native server deadlines also
          // bound work if the network is lost; later queries fail the same deadline.
          for (const client of scope.clients)
            void client.end().catch(() => undefined);
          reject(new RuntimeDatabaseUnavailableError());
        }, runtimeDatabaseBudgets.operationMs);
        void Promise.resolve()
          .then(action)
          .then(resolve, reject)
          .finally(() => clearTimeout(timer));
      }),
  );
}

export function trackDatabaseOperationClient(client: {
  end(): Promise<void>;
}): () => void {
  const scope = deadlines.getStore();
  scope?.clients.add(client);
  return () => {
    scope?.clients.delete(client);
  };
}

export function isGuestDatabaseOperation(): boolean {
  return deadlines.getStore() !== undefined;
}

export function remainingDatabaseOperationMs(
  maximum: number = runtimeDatabaseBudgets.transactionMs,
): number {
  const deadline = deadlines.getStore();
  const remaining =
    deadline === undefined
      ? maximum
      : Math.floor(deadline.at - performance.now());
  if (remaining <= 0) throw new RuntimeDatabaseUnavailableError();
  return Math.min(maximum, remaining);
}

export function isExpectedDatabaseExhaustion(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  const message = (error as { message?: unknown } | null)?.message;
  return (
    error instanceof RuntimeDatabaseUnavailableError ||
    [
      "Connection terminated unexpectedly",
      "Connection terminated",
      "Client was closed and is not queryable",
      "Client has encountered a connection error and is not queryable",
    ].includes(String(message)) ||
    [
      "53300",
      "40P01",
      "55P03",
      "57014",
      "25P03",
      "25P04",
      "57P01",
      "57P02",
      "57P03",
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
    ].includes(String(code))
  );
}
