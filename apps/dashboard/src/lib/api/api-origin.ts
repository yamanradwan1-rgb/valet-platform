export const DASHBOARD_DEVELOPMENT_API_ORIGIN = "http://localhost:3001";
export const STAFF_API_REWRITE_SOURCE = "/v1/staff/:path*";

export interface DashboardApiOriginEnvironment {
  readonly apiOrigin: string | undefined;
  readonly nodeEnv: string | undefined;
}

function configurationError(message: string): Error {
  return new Error(`Dashboard API_ORIGIN configuration error: ${message}`);
}

export function resolveDashboardApiOrigin(
  environment: DashboardApiOriginEnvironment,
): string {
  const value = environment.apiOrigin?.trim();
  if (value === undefined || value === "") {
    if (environment.nodeEnv === "production") {
      throw configurationError("API_ORIGIN is required in production.");
    }
    return DASHBOARD_DEVELOPMENT_API_ORIGIN;
  }

  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw configurationError("API_ORIGIN must be an absolute HTTP(S) origin.");
  }
  if (origin.protocol !== "http:" && origin.protocol !== "https:") {
    throw configurationError("API_ORIGIN must use HTTP or HTTPS.");
  }
  if (!/^https?:\/\/[^/?#\\]+\/?$/i.test(value)) {
    throw configurationError("API_ORIGIN must be an origin without a path, query, or fragment.");
  }
  if (
    environment.nodeEnv === "production" &&
    origin.protocol === "http:" &&
    !/^http:\/\/(?:127\.0\.0\.1|\[::1\])(?::[0-9]+)?\/?$/i.test(value)
  ) {
    throw configurationError(
      "production API_ORIGIN must use HTTPS unless it is an explicit same-host loopback address.",
    );
  }
  if (origin.username !== "" || origin.password !== "") {
    throw configurationError("API_ORIGIN must not contain credentials.");
  }
  if (origin.pathname !== "/" || origin.search !== "" || origin.hash !== "") {
    throw configurationError(
      "API_ORIGIN must not contain a path, query, or fragment.",
    );
  }
  return origin.origin;
}

export function staffApiRewriteDestination(
  environment: DashboardApiOriginEnvironment,
): string {
  return `${resolveDashboardApiOrigin(environment)}/v1/staff/:path*`;
}
