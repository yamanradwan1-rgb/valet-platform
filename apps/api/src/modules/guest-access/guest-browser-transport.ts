import { Injectable } from "@nestjs/common";
import {
  GUEST_BROWSER_CSRF_HEADER,
  GUEST_BROWSER_CSRF_VALUE,
} from "@valet/contracts";
import { serialize as serializeCookie } from "cookie";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import type { ApiRequest } from "../../common/http/api-request";
import type { GuestCredential } from "./guest-credential";

export const GUEST_BROWSER_COOKIE = "__Host-vaylet_guest_browser";
export const GUEST_ENROLLMENT_COOKIE = "__Host-vaylet_guest_enrollment";
export const GUEST_AUTH_ALLOWED_ORIGINS_ENV = "GUEST_AUTH_ALLOWED_ORIGINS";

export const bearerPattern = /^Bearer ([A-Za-z0-9_-]{43})$/;
export const browserPattern = /^vgb1\.[A-Za-z0-9_-]{43}$/;
export const enrollmentPattern = /^vge1\.[A-Za-z0-9_-]{43}$/;
export const browserCookieMaxAgeSeconds = 34_560_000;
export const enrollmentCookieMaxAgeSeconds = 900;

interface CookieValue {
  readonly present: boolean;
  readonly value?: string;
}

export function rawHeaderValues(request: ApiRequest, name: string): readonly string[] {
  const rawHeaders = request.rawHeaders;
  if (rawHeaders !== undefined && rawHeaders.length % 2 === 0) {
    const values: string[] = [];
    for (let index = 0; index < rawHeaders.length; index += 2) {
      if (rawHeaders[index]?.toLowerCase() === name) {
        const value = rawHeaders[index + 1];
        if (value !== undefined) values.push(value);
      }
    }
    return values;
  }
  const fallback = request.headers[name];
  if (typeof fallback === "string") return [fallback];
  return Array.isArray(fallback) ? fallback : [];
}

export function hasAuthorizationHeader(request: ApiRequest): boolean {
  return rawHeaderValues(request, "authorization").length > 0;
}

function singleHeader(request: ApiRequest, name: string): string | undefined {
  const values = rawHeaderValues(request, name);
  return values.length === 1 ? values[0] : undefined;
}

export function cookieValue(request: ApiRequest, name: string): CookieValue {
  const matches: string[] = [];
  for (const header of rawHeaderValues(request, "cookie")) {
    for (const part of header.split(";")) {
      const separator = part.indexOf("=");
      if (separator <= 0) continue;
      if (part.slice(0, separator).trim() === name) {
        matches.push(part.slice(separator + 1).trim());
      }
    }
  }
  if (matches.length === 0) return { present: false };
  if (matches.length !== 1) return { present: true };
  const value = matches[0];
  return value === undefined ? { present: true } : { present: true, value };
}

export function readGuestCredential(
  request: ApiRequest,
): GuestCredential | undefined {
  const authorizationValues = rawHeaderValues(request, "authorization");
  const browser = cookieValue(request, GUEST_BROWSER_COOKIE);
  if (authorizationValues.length > 0 && browser.present) return undefined;
  if (authorizationValues.length > 0) {
    if (authorizationValues.length !== 1) return undefined;
    const match = bearerPattern.exec(authorizationValues[0] ?? "");
    const secret = match?.[1];
    return secret === undefined ? undefined : { kind: "LEGACY_BEARER", secret };
  }
  return browser.value !== undefined && browserPattern.test(browser.value)
    ? { kind: "BROWSER_SESSION", secret: browser.value }
    : undefined;
}

export function readExchangeCredentials(request: ApiRequest):
  | {
      readonly browserSecret: string;
      readonly enrollmentSecret: string;
      readonly guestBearer: string;
    }
  | undefined {
  const authorizationValues = rawHeaderValues(request, "authorization");
  const browser = cookieValue(request, GUEST_BROWSER_COOKIE);
  const enrollment = cookieValue(request, GUEST_ENROLLMENT_COOKIE);
  if (authorizationValues.length !== 1) return undefined;
  const bearer = bearerPattern.exec(authorizationValues[0] ?? "")?.[1];
  if (
    bearer === undefined ||
    browser.value === undefined ||
    !browserPattern.test(browser.value) ||
    enrollment.value === undefined ||
    !enrollmentPattern.test(enrollment.value)
  ) {
    return undefined;
  }
  return {
    browserSecret: browser.value,
    enrollmentSecret: enrollment.value,
    guestBearer: bearer,
  };
}

export function readBrowserCookie(request: ApiRequest): string | undefined {
  if (rawHeaderValues(request, "authorization").length > 0) return undefined;
  const browser = cookieValue(request, GUEST_BROWSER_COOKIE);
  return browser.value !== undefined && browserPattern.test(browser.value)
    ? browser.value
    : undefined;
}

export function hasInvalidBrowserCookieTarget(request: ApiRequest): boolean {
  const browser = cookieValue(request, GUEST_BROWSER_COOKIE);
  return (
    browser.present &&
    (browser.value === undefined || !browserPattern.test(browser.value))
  );
}

export function serializeGuestCookie(
  name: string,
  value: string,
  maxAge: number,
  httpOnly = true,
): string {
  return serializeCookie(name, value, {
    httpOnly,
    maxAge,
    path: "/",
    sameSite: "lax",
    secure: true,
  });
}

export function browserCookie(
  value: string,
  maxAge = browserCookieMaxAgeSeconds,
): string {
  return serializeGuestCookie(GUEST_BROWSER_COOKIE, value, maxAge);
}

export function enrollmentCookie(
  value: string,
  maxAge = enrollmentCookieMaxAgeSeconds,
): string {
  return serializeGuestCookie(GUEST_ENROLLMENT_COOKIE, value, maxAge);
}

export function clearBrowserCookie(): string {
  return browserCookie("", 0);
}

export function clearEnrollmentCookie(): string {
  return enrollmentCookie("", 0);
}

export function parseGuestAuthAllowedOrigins(
  configured = process.env[GUEST_AUTH_ALLOWED_ORIGINS_ENV],
): ReadonlySet<string> {
  if (configured === undefined || configured.trim() === "") return new Set();
  const origins = new Set<string>();
  for (const candidate of configured.split(",")) {
    const value = candidate.trim();
    if (value === "" || value === "*") {
      throw new Error(
        "Guest Browser Session authentication requires explicit origins.",
      );
    }
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(
        "Guest Browser Session authentication received an invalid origin.",
      );
    }
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      parsed.origin !== value
    ) {
      throw new Error(
        "Guest Browser Session authentication requires canonical origins.",
      );
    }
    origins.add(value);
  }
  return origins;
}

@Injectable()
export class GuestAuthOriginPolicy {
  readonly allowedOrigins = parseGuestAuthAllowedOrigins();

  allows(origin: string | undefined): origin is string {
    return origin !== undefined && this.allowedOrigins.has(origin);
  }
}

export function requireGuestBrowserMutationTransport(
  request: ApiRequest,
  originPolicy: GuestAuthOriginPolicy,
): void {
  const origin = singleHeader(request, "origin");
  const contentType = singleHeader(request, "content-type");
  const csrf = singleHeader(request, GUEST_BROWSER_CSRF_HEADER);
  if (
    !originPolicy.allows(origin) ||
    contentType === undefined ||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType) ||
    csrf !== GUEST_BROWSER_CSRF_VALUE
  ) {
    throw new ApiTransportValidationError();
  }
}
