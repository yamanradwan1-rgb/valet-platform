import { expect, type Page, type Request, type Route } from "@playwright/test";

/**
 * Fixture-only barrier: backdating an authenticated session changes its
 * security identity. Drain already-started requests and prevent new ones
 * from reaching the server while the test changes that identity.
 */
export function trackStaffRequests(page: Page) {
  const pending = new Set<Request>();
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/v1/staff/")) {
      pending.add(request);
    }
  });
  page.on("requestfinished", (request) => pending.delete(request));
  page.on("requestfailed", (request) => pending.delete(request));

  return async function withStaffRequestsQuiesced<T>(fixture: () => Promise<T>): Promise<T> {
    const pattern = "**/v1/staff/**";
    const block = (route: Route) => route.abort("aborted");
    await page.route(pattern, block);
    try {
      await expect.poll(() => pending.size, {
        message: "Staff requests must drain before changing fixture session identity",
      }).toBe(0);
      return await fixture();
    } finally {
      await page.unroute(pattern, block);
    }
  };
}
