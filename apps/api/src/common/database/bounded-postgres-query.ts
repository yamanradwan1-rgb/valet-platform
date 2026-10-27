import type { PoolClient } from "pg";

import {
  isGuestDatabaseOperation,
  remainingDatabaseOperationMs,
  RuntimeDatabaseUnavailableError,
} from "./runtime-database-deadline";
import type { GeneralDatabaseBudgets } from "./runtime-postgres-policy";
import type { RuntimePoolMeasurements } from "./bounded-postgres-pool";

export function boundPostgresQueries(
  client: PoolClient,
  general: GeneralDatabaseBudgets,
  measurements: RuntimePoolMeasurements,
): void {
  const query = client.query.bind(client);
  client.query = ((...args: unknown[]) => {
    const config =
      typeof args[0] === "string"
        ? { text: args[0] }
        : (args[0] as { text?: string; query_timeout?: number });
    const callback = args.at(-1);
    try {
      const maximum = isGuestDatabaseOperation()
        ? 3500
        : general.statementMs + 500;
      const remaining =
        config?.text === "ROLLBACK"
          ? 3500
          : remainingDatabaseOperationMs(maximum);
      if (config?.text !== undefined) {
        args[0] = {
          ...config,
          query_timeout: Math.min(
            maximum,
            remaining,
            config.query_timeout && config.query_timeout > 0
              ? config.query_timeout
              : maximum,
          ),
        };
      }
    } catch (error) {
      if (typeof callback === "function") {
        queueMicrotask(() => callback(error));
        return;
      }
      return Promise.reject(error);
    }
    const failure = (error: unknown): unknown => {
      const code = (error as { code?: string })?.code;
      if (code === "55P03") measurements.lockTimeouts += 1;
      if (code === "57014") measurements.statementTimeouts += 1;
      if (code === "25P03" || code === "25P04")
        measurements.transactionTimeouts += 1;
      if ((error as { message?: string })?.message === "Query read timeout") {
        // Discard, never recycle, a connection with an ambiguous protocol outcome.
        measurements.queryTimeouts += 1;
        client.release(true);
        return new RuntimeDatabaseUnavailableError("QUERY_TIMEOUT");
      }
      return error;
    };
    if (typeof callback === "function") {
      args[args.length - 1] = (error: unknown, result: unknown) =>
        callback(error == null ? error : failure(error), result);
    }
    const result = Reflect.apply(query, client, args);
    return result instanceof Promise
      ? result.catch((error: unknown) => {
          throw failure(error);
        })
      : result;
  }) as PoolClient["query"];
}
