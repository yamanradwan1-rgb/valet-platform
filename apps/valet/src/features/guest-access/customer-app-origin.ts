/**
 * Customer application origin and canonical Guest Access URL boundary.
 *
 * The Customer origin is explicit configuration (NEXT_PUBLIC_CUSTOMER_APP_ORIGIN),
 * separate from API_ORIGIN, validated centrally here and used by the QR, copy,
 * and dev-only open actions through one builder so they can never diverge.
 * Malformed or missing origins fail closed; production requires HTTPS while
 * development may use localhost HTTP.
 */

const GUEST_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type CustomerAppOriginFailure = "MISSING" | "INVALID";

export type CustomerAppOriginResult =
  | { readonly ok: true; readonly origin: string }
  | { readonly ok: false; readonly reason: CustomerAppOriginFailure };

const LOCALHOST_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function resolveCustomerAppOrigin(input: {
  readonly isProduction: boolean;
  readonly raw: string | null | undefined;
}): CustomerAppOriginResult {
  const candidate = (input.raw ?? "").trim();
  if (candidate === "") return { ok: false, reason: "MISSING" };

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, reason: "INVALID" };
  }

  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "INVALID" };
  }
  if (url.search !== "" || url.hash !== "" || url.pathname !== "/") {
    return { ok: false, reason: "INVALID" };
  }

  if (url.protocol === "https:") {
    return { ok: true, origin: url.origin };
  }

  if (
    url.protocol === "http:" &&
    !input.isProduction &&
    LOCALHOST_HTTP_HOSTS.has(url.hostname.toLowerCase())
  ) {
    return { ok: true, origin: url.origin };
  }

  return { ok: false, reason: "INVALID" };
}

export function isGuestTokenShape(rawToken: string): boolean {
  return GUEST_TOKEN_PATTERN.test(rawToken);
}

/**
 * Builds the one canonical shareable Guest URL for a freshly issued token.
 * Rejects any value that does not satisfy the exact credential shape so no
 * malformed material can ever be encoded into a QR or link.
 */
export function buildGuestAccessUrl(
  origin: string,
  rawToken: string,
): string | null {
  if (!GUEST_TOKEN_PATTERN.test(rawToken)) return null;
  const cleanOrigin = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${cleanOrigin}/#guestToken=${rawToken}`;
}
