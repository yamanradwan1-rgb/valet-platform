import {
  isExpectedDatabaseExhaustion,
  RuntimeDatabaseUnavailableError,
} from "./runtime-database-deadline";

/** Internal classification only. Never render driver messages, SQL or error causes. */
export function databaseFailureReason(error: unknown): string | undefined {
  if (error instanceof RuntimeDatabaseUnavailableError) return error.reason;
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "55P03") return "LOCK_TIMEOUT";
  if (code === "57014") {
    const message = (error as { message?: unknown }).message;
    return message === "canceling statement due to statement timeout"
      ? "STATEMENT_TIMEOUT"
      : "QUERY_CANCELED";
  }
  if (code === "25P03") return "IDLE_TRANSACTION_TIMEOUT";
  if (code === "25P04") return "TRANSACTION_TIMEOUT";
  if (code === "40P01") return "DEADLOCK";
  if (code === "53300") return "SERVER_CONNECTION_LIMIT";
  if (isExpectedDatabaseExhaustion(error)) return "DATABASE_UNAVAILABLE";
  return undefined;
}

export function isPostgresAcquisitionTimeout(error: unknown): boolean {
  const message = (error as { message?: unknown } | null)?.message;
  return (
    message === "timeout exceeded when trying to connect" ||
    message === "Connection terminated due to connection timeout"
  );
}
