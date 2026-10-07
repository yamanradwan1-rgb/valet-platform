import { expect } from "vitest";

import {
  GUEST_CONTEXT_COOKIE,
  GUEST_PENDING_BROWSER_COOKIE,
} from "../src/modules/guest-access/guest-browser-context-transport";
import {
  GUEST_BROWSER_COOKIE,
  GUEST_ENROLLMENT_COOKIE,
} from "../src/modules/guest-access/guest-browser-transport";
import {
  GuestBrowserSessionTestContext,
  cookieValue,
  mutationHeaders,
  type GuestVisit,
} from "./guest-browser-session-test-context";

export interface AuthorizedBrowser {
  readonly browser: string;
  readonly visit: GuestVisit;
}

export interface PreparedConflict {
  readonly enrollment: string;
  readonly pendingBrowser: string;
}

export async function authorizeBrowser(
  context: GuestBrowserSessionTestContext,
  visit?: GuestVisit,
): Promise<AuthorizedBrowser> {
  const currentVisit = visit ?? (await context.createVisit());
  const enrolled = await context.request(
    "POST",
    "/v1/guest/browser-session/enroll",
    { body: {}, headers: mutationHeaders },
  );
  expect(enrolled.status).toBe(204);
  const browser = cookieValue(enrolled.headers, GUEST_BROWSER_COOKIE);
  const enrollment = cookieValue(enrolled.headers, GUEST_ENROLLMENT_COOKIE);
  expect(browser).toMatch(/^vgb1\.[A-Za-z0-9_-]{43}$/);
  expect(enrollment).toMatch(/^vge1\.[A-Za-z0-9_-]{43}$/);
  expect(cookieValue(enrolled.headers, GUEST_CONTEXT_COOKIE)).toBeUndefined();
  const exchanged = await context.request(
    "POST",
    "/v1/guest/browser-session/exchange",
    {
      authorization: `Bearer ${currentVisit.token}`,
      body: {},
      cookies: [
        context.browserCookie(browser!),
        context.enrollmentCookie(enrollment!),
      ],
      headers: mutationHeaders,
    },
  );
  expect(exchanged.status).toBe(204);
  return { browser: browser!, visit: currentVisit };
}

export async function prepareConflict(
  context: GuestBrowserSessionTestContext,
  source: AuthorizedBrowser,
  target: GuestVisit,
): Promise<PreparedConflict> {
  const prepared = await context.request(
    "POST",
    "/v1/guest/browser-session/prepare",
    {
      authorization: `Bearer ${target.token}`,
      body: {},
      cookies: [context.browserCookie(source.browser)],
      headers: mutationHeaders,
    },
  );
  expect(prepared).toMatchObject({
    body: { currentScope: "ACTIVE", result: "CONTEXT_CONFLICT" },
    status: 200,
  });
  expect(prepared.headers.get("cache-control")).toBe("no-store");
  expect(cookieValue(prepared.headers, GUEST_BROWSER_COOKIE)).toBeUndefined();
  expect(cookieValue(prepared.headers, GUEST_CONTEXT_COOKIE)).toBeUndefined();
  const enrollment = cookieValue(prepared.headers, GUEST_ENROLLMENT_COOKIE);
  const pendingBrowser = cookieValue(
    prepared.headers,
    GUEST_PENDING_BROWSER_COOKIE,
  );
  expect(enrollment).toMatch(/^vge1\.[A-Za-z0-9_-]{43}$/);
  expect(pendingBrowser).toMatch(/^vgb1\.[A-Za-z0-9_-]{43}$/);
  return { enrollment: enrollment!, pendingBrowser: pendingBrowser! };
}
