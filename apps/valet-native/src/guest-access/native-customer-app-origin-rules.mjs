/* global URL */

const LOCAL_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const NATIVE_RELEASE_CUSTOMER_APP_ORIGIN_ERROR =
  "EXPO_PUBLIC_CUSTOMER_APP_ORIGIN is invalid. Native release requires an explicitly supplied bare HTTPS Customer App origin with no credentials, path, query, or fragment.";

export function resolveNativeCustomerAppOrigin(input) {
  const candidate = (input.raw ?? "").trim();
  if (candidate === "") return { ok: false, reason: "MISSING" };

  let url;
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

export function requireNativeReleaseCustomerAppOrigin(raw) {
  const result = resolveNativeCustomerAppOrigin({ isProduction: true, raw });
  if (!result.ok) throw new Error(NATIVE_RELEASE_CUSTOMER_APP_ORIGIN_ERROR);
  return result.origin;
}
