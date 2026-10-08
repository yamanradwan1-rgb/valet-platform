export const CUSTOMER_DEVELOPMENT_API_ORIGIN = "http://localhost:3001";
export const GUEST_API_REWRITE_SOURCE = "/api/v1/guest/:path*";

export interface CustomerApiOriginEnvironment {
  readonly apiOrigin: string | undefined;
  readonly nodeEnv: string | undefined;
}

function configurationError(message: string): Error {
  return new Error(`Customer API_ORIGIN configuration error: ${message}`);
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

/** Resolves the server-only origin used by the same-origin Guest API proxy. */
export function resolveCustomerApiOrigin(
  environment: CustomerApiOriginEnvironment,
): string {
  const value = environment.apiOrigin?.trim();
  if (value === undefined || value === "") {
    if (environment.nodeEnv === "production") {
      throw configurationError("API_ORIGIN is required in production.");
    }
    return CUSTOMER_DEVELOPMENT_API_ORIGIN;
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
  if (
    environment.nodeEnv === "production" &&
    origin.protocol !== "https:" &&
    !isLoopbackHostname(origin.hostname)
  ) {
    throw configurationError(
      "production API_ORIGIN must use HTTPS unless it is an explicit loopback origin.",
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

export function guestApiBaseUrl(origin: string): string {
  return `${origin}/v1/guest`;
}

export function guestApiRewriteDestination(
  environment: CustomerApiOriginEnvironment,
): string {
  return `${guestApiBaseUrl(resolveCustomerApiOrigin(environment))}/:path*`;
}
