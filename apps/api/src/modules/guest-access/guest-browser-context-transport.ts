import type { ApiRequest } from "../../common/http/api-request";
import {
  GUEST_BROWSER_COOKIE,
  GUEST_ENROLLMENT_COOKIE,
  bearerPattern,
  browserCookieMaxAgeSeconds,
  browserPattern,
  cookieValue,
  enrollmentCookieMaxAgeSeconds,
  enrollmentPattern,
  rawHeaderValues,
  serializeGuestCookie,
} from "./guest-browser-transport";

export const GUEST_PENDING_BROWSER_COOKIE = "__Host-vaylet_guest_pending_browser";
export const GUEST_CONTEXT_COOKIE = "__Host-vaylet_guest_context";

const contextPattern = /^vgc1\.[0-9a-f]{32}$/;

export function readContextPrepareCredentials(request: ApiRequest):
  | { readonly currentBrowserSecret?: string; readonly guestBearer: string }
  | undefined {
  const authorizationValues = rawHeaderValues(request, "authorization");
  const browser = cookieValue(request, GUEST_BROWSER_COOKIE);
  if (authorizationValues.length !== 1) return undefined;
  const guestBearer = bearerPattern.exec(authorizationValues[0] ?? "")?.[1];
  if (guestBearer === undefined) return undefined;
  if (
    browser.present &&
    (browser.value === undefined || !browserPattern.test(browser.value))
  ) {
    return undefined;
  }
  return browser.value === undefined
    ? { guestBearer }
    : { currentBrowserSecret: browser.value, guestBearer };
}

export function readContextSwitchCredentials(request: ApiRequest) {
  const authorizationValues = rawHeaderValues(request, "authorization");
  const browser = cookieValue(request, GUEST_BROWSER_COOKIE);
  const enrollment = cookieValue(request, GUEST_ENROLLMENT_COOKIE);
  const pending = cookieValue(request, GUEST_PENDING_BROWSER_COOKIE);
  if (authorizationValues.length !== 1) return undefined;
  const guestBearer = bearerPattern.exec(authorizationValues[0] ?? "")?.[1];
  if (
    guestBearer === undefined ||
    browser.value === undefined ||
    !browserPattern.test(browser.value) ||
    enrollment.value === undefined ||
    !enrollmentPattern.test(enrollment.value) ||
    pending.value === undefined ||
    !browserPattern.test(pending.value)
  ) {
    return undefined;
  }
  return {
    currentBrowserSecret: browser.value,
    enrollmentSecret: enrollment.value,
    guestBearer,
    pendingBrowserSecret: pending.value,
  };
}

export type ContextSwitchReconcileCredentials =
  | { readonly kind: "NONE" }
  | {
      readonly kind: "READY";
      readonly currentBrowserSecret: string;
      readonly enrollmentSecret: string;
      readonly pendingBrowserSecret: string;
    }
  | { readonly kind: "INVALID" };

export function readContextSwitchReconcileCredentials(
  request: ApiRequest,
): ContextSwitchReconcileCredentials {
  if (rawHeaderValues(request, "authorization").length > 0) {
    return { kind: "INVALID" };
  }
  const browser = cookieValue(request, GUEST_BROWSER_COOKIE);
  const enrollment = cookieValue(request, GUEST_ENROLLMENT_COOKIE);
  const pending = cookieValue(request, GUEST_PENDING_BROWSER_COOKIE);
  if (!enrollment.present && !pending.present) return { kind: "NONE" };
  if (
    browser.value === undefined ||
    !browserPattern.test(browser.value) ||
    enrollment.value === undefined ||
    !enrollmentPattern.test(enrollment.value) ||
    pending.value === undefined ||
    !browserPattern.test(pending.value)
  ) {
    return { kind: "INVALID" };
  }
  return {
    kind: "READY",
    currentBrowserSecret: browser.value,
    enrollmentSecret: enrollment.value,
    pendingBrowserSecret: pending.value,
  };
}

export function pendingBrowserCookie(
  value: string,
  maxAge = enrollmentCookieMaxAgeSeconds,
): string {
  return serializeGuestCookie(GUEST_PENDING_BROWSER_COOKIE, value, maxAge);
}

export function browserContextCookie(
  value: string,
  maxAge = browserCookieMaxAgeSeconds,
): string {
  if (!contextPattern.test(value)) {
    throw new Error("Guest browser context marker is invalid.");
  }
  return serializeGuestCookie(GUEST_CONTEXT_COOKIE, value, maxAge, false);
}

export function clearPendingBrowserCookie(): string {
  return pendingBrowserCookie("", 0);
}

export function clearBrowserContextCookie(): string {
  return serializeGuestCookie(GUEST_CONTEXT_COOKIE, "", 0, false);
}
