import { describe, expect, it } from "vitest";

import type { ApiRequest } from "../src/common/http/api-request";
import {
  GUEST_BROWSER_COOKIE,
  GUEST_ENROLLMENT_COOKIE,
  GuestAuthOriginPolicy,
  browserCookie,
  enrollmentCookie,
  hasInvalidBrowserCookieTarget,
  parseGuestAuthAllowedOrigins,
  readBrowserCookie,
  readExchangeCredentials,
  readGuestCredential,
  requireGuestBrowserMutationTransport,
} from "../src/modules/guest-access/guest-browser-transport";

const bearer = "A".repeat(43);
const browser = `vgb1.${"B".repeat(43)}`;
const enrollment = `vge1.${"E".repeat(43)}`;
const origin = "https://customer.example.test";

function request(rawHeaders: string[]): ApiRequest {
  const headers: Record<string, string> = {};
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index]?.toLowerCase();
    const value = rawHeaders[index + 1];
    if (name !== undefined && value !== undefined) headers[name] = value;
  }
  return { headers, rawHeaders } as unknown as ApiRequest;
}

describe("Guest Browser Session transport", () => {
  it("parses exactly one legacy bearer or one Browser Session authority", () => {
    expect(
      readGuestCredential(request(["Authorization", `Bearer ${bearer}`])),
    ).toEqual({ kind: "LEGACY_BEARER", secret: bearer });
    expect(
      readGuestCredential(
        request(["Cookie", `${GUEST_BROWSER_COOKIE}=${browser}`]),
      ),
    ).toEqual({ kind: "BROWSER_SESSION", secret: browser });
  });

  it("fails closed for mixed and duplicate credential sources", () => {
    expect(
      readGuestCredential(
        request([
          "Authorization",
          `Bearer ${bearer}`,
          "Cookie",
          `${GUEST_BROWSER_COOKIE}=${browser}`,
        ]),
      ),
    ).toBeUndefined();
    expect(
      readGuestCredential(
        request([
          "Authorization",
          `Bearer ${bearer}`,
          "Authorization",
          `Bearer ${bearer}`,
        ]),
      ),
    ).toBeUndefined();
    expect(
      readGuestCredential(
        request([
          "Cookie",
          `${GUEST_BROWSER_COOKIE}=${browser}; ${GUEST_BROWSER_COOKIE}=${browser}`,
        ]),
      ),
    ).toBeUndefined();
    expect(
      hasInvalidBrowserCookieTarget(
        request([
          "Cookie",
          `${GUEST_BROWSER_COOKIE}=${browser}; ${GUEST_BROWSER_COOKIE}=${browser}`,
        ]),
      ),
    ).toBe(true);
    expect(
      hasInvalidBrowserCookieTarget(
        request(["Cookie", `${GUEST_BROWSER_COOKIE}=malformed`]),
      ),
    ).toBe(true);
    expect(
      hasInvalidBrowserCookieTarget(
        request(["Cookie", `${GUEST_BROWSER_COOKIE}=${browser}`]),
      ),
    ).toBe(false);
  });

  it("requires the exact enrollment/browser pair for exchange", () => {
    const valid = request([
      "Authorization",
      `Bearer ${bearer}`,
      "Cookie",
      `${GUEST_BROWSER_COOKIE}=${browser}; ${GUEST_ENROLLMENT_COOKIE}=${enrollment}`,
    ]);
    expect(readExchangeCredentials(valid)).toEqual({
      browserSecret: browser,
      enrollmentSecret: enrollment,
      guestBearer: bearer,
    });
    expect(
      readExchangeCredentials(
        request([
          "Authorization",
          `Bearer ${bearer}`,
          "Cookie",
          `${GUEST_BROWSER_COOKIE}=${browser}`,
        ]),
      ),
    ).toBeUndefined();
  });

  it("never accepts bearer authority on the browser-cookie-only path", () => {
    expect(
      readBrowserCookie(
        request([
          "Authorization",
          `Bearer ${bearer}`,
          "Cookie",
          `${GUEST_BROWSER_COOKIE}=${browser}`,
        ]),
      ),
    ).toBeUndefined();
  });

  it("serializes host-only Secure HttpOnly Lax cookies without Domain", () => {
    for (const serialized of [
      browserCookie(browser),
      enrollmentCookie(enrollment),
    ]) {
      expect(serialized).toContain("Path=/");
      expect(serialized).toContain("HttpOnly");
      expect(serialized).toContain("Secure");
      expect(serialized).toContain("SameSite=Lax");
      expect(serialized).not.toContain("Domain=");
    }
    expect(browserCookie(browser)).toContain("Max-Age=34560000");
    expect(enrollmentCookie(enrollment)).toContain("Max-Age=900");
  });

  it("accepts only canonical explicit configured origins", () => {
    expect([
      ...parseGuestAuthAllowedOrigins(`${origin},https://other.example.test`),
    ]).toEqual([origin, "https://other.example.test"]);
    expect(() => parseGuestAuthAllowedOrigins("*")).toThrow();
    expect(() => parseGuestAuthAllowedOrigins(`${origin}/`)).toThrow();
    expect(() => parseGuestAuthAllowedOrigins(`${origin}/path`)).toThrow();
  });

  it("requires exact Origin, JSON content type and same-origin CSRF header", () => {
    const policy = {
      allows: (value: string | undefined): value is string => value === origin,
    } as GuestAuthOriginPolicy;
    const valid = request([
      "Origin",
      origin,
      "Content-Type",
      "application/json; charset=utf-8",
      "x-vaylet-guest-session",
      "v1",
    ]);
    expect(() =>
      requireGuestBrowserMutationTransport(valid, policy),
    ).not.toThrow();
    for (const invalid of [
      request([
        "Content-Type",
        "application/json",
        "x-vaylet-guest-session",
        "v1",
      ]),
      request([
        "Origin",
        "null",
        "Content-Type",
        "application/json",
        "x-vaylet-guest-session",
        "v1",
      ]),
    ]) {
      expect(() =>
        requireGuestBrowserMutationTransport(invalid, policy),
      ).toThrow();
    }
    expect(() =>
      requireGuestBrowserMutationTransport(
        request([
          "Origin",
          origin,
          "Origin",
          origin,
          "Content-Type",
          "application/json",
          "x-vaylet-guest-session",
          "v1",
        ]),
        policy,
      ),
    ).toThrow();
  });
});
