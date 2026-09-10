/** Native Customer-app configuration and canonical Guest Access URL boundary. */

const GUEST_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const LOCAL_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type NativeCustomerAppOriginResult =
  | { readonly ok: true; readonly origin: string }
  | { readonly ok: false; readonly reason: "INVALID" | "MISSING" };

function nativeReleaseMode(): boolean {
  return typeof __DEV__ === "boolean"
    ? !__DEV__
    : process.env.NODE_ENV === "production";
}

export function resolveNativeCustomerAppOrigin(input: {
  readonly isProduction: boolean;
  readonly raw: string | null | undefined;
}): NativeCustomerAppOriginResult {
  const candidate = (input.raw ?? "").trim();
  if (candidate === "") return { ok: false, reason: "MISSING" };

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, reason: "INVALID" };
  }
  if (
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.pathname !== "/"
  ) {
    return { ok: false, reason: "INVALID" };
  }
  if (url.protocol === "https:") {
    return { ok: true, origin: url.origin };
  }
  if (
    url.protocol === "http:" &&
    !input.isProduction &&
    LOCAL_HTTP_HOSTS.has(url.hostname.toLowerCase())
  ) {
    return { ok: true, origin: url.origin };
  }
  return { ok: false, reason: "INVALID" };
}

export function currentNativeCustomerAppOrigin(): NativeCustomerAppOriginResult {
  return resolveNativeCustomerAppOrigin({
    isProduction: nativeReleaseMode(),
    raw: process.env.EXPO_PUBLIC_CUSTOMER_APP_ORIGIN,
  });
}

export function buildNativeGuestAccessUrl(
  origin: string,
  rawToken: string,
): string | null {
  if (!GUEST_TOKEN_PATTERN.test(rawToken)) return null;
  const cleanOrigin = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${cleanOrigin}/#guestToken=${rawToken}`;
}

export function isCanonicalNativeGuestAccessUrl(
  value: string,
  isProduction = nativeReleaseMode(),
): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const origin = resolveNativeCustomerAppOrigin({
    isProduction,
    raw: url.origin,
  });
  const token = /^#guestToken=([A-Za-z0-9_-]{43})$/.exec(url.hash)?.[1];
  return (
    origin.ok &&
    token !== undefined &&
    url.username === "" &&
    url.password === "" &&
    url.pathname === "/" &&
    url.search === "" &&
    value === buildNativeGuestAccessUrl(origin.origin, token)
  );
}
