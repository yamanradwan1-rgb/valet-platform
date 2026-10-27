import { databaseFailureReason } from "../database/database-failure-reason";
import { resolveRequestId, type ApiRequest } from "../http/api-request";

const failures = new WeakMap<object, { code: string; reason: string }>();

/** Codes are supplied only by the shared, allowlisted API error mapper. */
export function recordRequestFailure(
  request: ApiRequest,
  code: string,
  error: unknown,
): void {
  const reason =
    databaseFailureReason(error) ??
    (code.includes("RATE_LIMITED")
      ? "RATE_LIMITED"
      : code.startsWith("STAFF_AUTHENTICATION_")
        ? "AUTHENTICATION"
        : code === "AUTHORIZATION_DENIED" || code.endsWith("ACCESS_DENIED")
          ? "AUTHORIZATION"
          : code.startsWith("MFA_")
            ? "MFA"
            : "APPLICATION");
  failures.set(request, { code, reason });
}

const fixedRoutes = [
  "/v1/staff/operational-context",
  "/v1/staff/tasks/queue",
  "/v1/staff/valet-sessions/directory",
  "/v1/staff/check-in/intakes",
  "/v1/staff/auth/login",
  "/v1/staff/auth/refresh",
  "/v1/staff/auth/native/login",
  "/v1/staff/auth/native/refresh",
] as const;
const overviewSuffixes = [
  "session-state-counts",
  "sessions",
  "tasks",
  "active-shifts",
];

/** Return only source-owned templates; never return a request target or selector. */
export function performanceRoute(
  method: unknown,
  url: unknown,
): string | undefined {
  if (typeof url !== "string") return undefined;
  const path = url.split("?", 1)[0];
  const fixed = fixedRoutes.find((route) => route === path);
  if (
    fixed &&
    method ===
      (fixed.includes("/auth/") || fixed.endsWith("/intakes") ? "POST" : "GET")
  )
    return fixed;
  const match =
    /^\/v1\/staff\/dashboard\/locations\/[^/]+\/overview\/([^/]+)$/.exec(
      path ?? "",
    );
  if (method === "GET" && match && overviewSuffixes.includes(match[1]!))
    return `/v1/staff/dashboard/locations/:locationId/overview/${match[1]}`;
  return undefined;
}

export function formatPerformanceRequest(
  request: Pick<ApiRequest, "headers" | "requestId">,
  route: string,
  status: number,
): string {
  const failure = failures.get(request);
  const reason =
    status === 499
      ? "CLIENT_DISCONNECT"
      : (failure?.reason ??
        (status === 401
          ? "AUTHENTICATION"
          : status === 403
            ? "AUTHORIZATION"
            : status === 429
              ? "RATE_LIMITED"
              : status >= 500
                ? "UNCLASSIFIED_SERVER"
                : "NONE"));
  return (
    ` route=${route} requestId=${request.requestId ?? "unavailable"}` +
    ` errorCode=${failure?.code ?? "NONE"} reason=${reason}`
  );
}

export function ensurePerformanceRequestId(
  request: Pick<ApiRequest, "headers" | "requestId">,
): void {
  request.requestId ??= resolveRequestId(request.headers ?? {});
}
