/** Public metrics must never contain the raw request target, including a query or credential. */
export type HttpOperationClass =
  | "GUEST_READ"
  | "GUEST_MUTATION"
  | "STAFF_AUTH"
  | "STAFF_OPERATION"
  | "HEALTH"
  | "OTHER";

export type HttpOutcomeClass =
  | "SUCCESS"
  | "AUTH_FAILURE"
  | "RATE_LIMITED"
  | "CLIENT_FAILURE"
  | "SERVER_FAILURE";

export interface HttpMetric {
  readonly operation: HttpOperationClass;
  readonly outcome: HttpOutcomeClass;
  readonly status: number;
  readonly durationMs: number;
}

export function classifyHttpOperation(
  method: unknown,
  originalUrl: unknown,
): HttpOperationClass {
  if (typeof method !== "string" || typeof originalUrl !== "string")
    return "OTHER";

  // The URL is used only to select a fixed enumeration; never put it in output.
  const path = originalUrl.split("?", 1)[0] ?? "";
  if (path === "/health/live" || path === "/health/ready") return "HEALTH";
  if (/^\/v1\/guest(?:\/|$)/.test(path))
    return method === "GET" || method === "HEAD"
      ? "GUEST_READ"
      : "GUEST_MUTATION";
  if (/^\/v1\/staff\/auth(?:\/|$)/.test(path)) return "STAFF_AUTH";
  if (/^\/v1\/staff(?:\/|$)/.test(path)) return "STAFF_OPERATION";
  return "OTHER";
}

export function classifyHttpOutcome(status: number): HttpOutcomeClass {
  if (status === 401 || status === 403) return "AUTH_FAILURE";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "SERVER_FAILURE";
  if (status >= 400) return "CLIENT_FAILURE";
  return "SUCCESS";
}

export function buildHttpMetric(
  operation: HttpOperationClass,
  status: number,
  elapsedMs: number,
): HttpMetric {
  const boundedStatus =
    Number.isInteger(status) && status >= 100 && status <= 599 ? status : 500;
  return {
    operation,
    outcome: classifyHttpOutcome(boundedStatus),
    status: boundedStatus,
    durationMs: Number.isFinite(elapsedMs)
      ? Math.max(0, Math.round(elapsedMs))
      : 0,
  };
}

export function formatHttpMetric(metric: HttpMetric): string {
  return (
    `HTTP_METRIC operation=${metric.operation} outcome=${metric.outcome}` +
    ` status=${metric.status} durationMs=${metric.durationMs}`
  );
}
