/** Native Customer-app configuration and canonical Guest Access URL boundary. */

export {
  NATIVE_RELEASE_CUSTOMER_APP_ORIGIN_ERROR,
  requireNativeReleaseCustomerAppOrigin,
  resolveNativeCustomerAppOrigin,
} from "./native-customer-app-origin-rules.mjs";
export type { NativeCustomerAppOriginResult } from "./native-customer-app-origin-rules.mjs";

import { resolveNativeCustomerAppOrigin } from "./native-customer-app-origin-rules.mjs";

const GUEST_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function nativeReleaseMode(): boolean {
  return typeof __DEV__ === "boolean"
    ? !__DEV__
    : process.env.NODE_ENV === "production";
}

export function currentNativeCustomerAppOrigin(): import("./native-customer-app-origin-rules.mjs").NativeCustomerAppOriginResult {
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
