import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

const SESSION_MARKER = "vaylet.staff.auth-boundary.v1";
const OLD_ACCESS = "vsa1.0123456789012345678901234567890123456789012";
const packageRequire = createRequire(`${process.cwd()}/package.json`);
let fixtureUrl = "";
let stopServer: (() => Promise<void>) | undefined;

test.beforeAll(async () => {
  // Isolated real-browser fixture uses the actual StaffAuthProvider and client.
  // The production Next dev server currently fails to resolve baseline TS .js
  // imports, so Vite serves only the scoped auth fixture for this regression.
  const viteEntry = createRequire(packageRequire.resolve("vitest")).resolve("vite");
  const { createServer } = await import(pathToFileURL(viteEntry).href);
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    esbuild: { jsx: "automatic", jsxImportSource: "react" },
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  fixtureUrl = `${server.resolvedUrls?.local[0]}e2e/staff-logout-browser-fixture.html`;
  stopServer = () => server.close();
});

test.afterAll(async () => {
  await stopServer?.();
});

test("a failed logout never restores previous staff on refresh-cookie backed remount", async ({
  page, context,
}) => {
  let refreshRequests = 0;
  let loginSucceeded = false;
  await page.route("**/v1/staff/auth/refresh", async (route) => {
    refreshRequests++;
    const retainedCookie =
      (await route.request().allHeaders()).cookie?.includes("staff-refresh-e2e=") === true;
    await route.fulfill({
      status: loginSucceeded && retainedCookie ? 200 : 401,
      contentType: "application/json",
      body: loginSucceeded && retainedCookie
        ? JSON.stringify({
            accessToken: OLD_ACCESS,
            tokenType: "Bearer",
            accessExpiresAt: "2028-01-01T00:00:00.000Z",
            sessionExpiresAt: "2028-02-01T00:00:00.000Z",
          })
        : JSON.stringify({ code: "STAFF_AUTHENTICATION_REQUIRED" }),
    });
  });
  await page.route("**/v1/staff/auth/login", async (route) => {
    loginSucceeded = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        accessToken: OLD_ACCESS,
        tokenType: "Bearer",
        accessExpiresAt: "2028-01-01T00:00:00.000Z",
        sessionExpiresAt: "2028-02-01T00:00:00.000Z",
      }),
    });
  });
  await page.route("**/v1/staff/auth/logout", async (route) => {
    await route.abort("failed");
  });

  await page.goto(fixtureUrl);
  await expect(page.locator("#staff-auth-status")).toHaveText("unauthenticated");
  await page.locator("#sign-in").click();
  await expect(page.locator("#staff-auth-status")).toHaveText("authenticated");
  await expect(page.locator("#staff-auth-token")).toHaveText(OLD_ACCESS);

  await context.addCookies([{
    name: "staff-refresh-e2e",
    value: "opaque-unrevoked-refresh-cookie",
    url: new URL(page.url()).origin,
    httpOnly: true,
    sameSite: "Lax",
  }]);
  await page.locator("#sign-out").click();
  await expect(page.locator("#staff-auth-status")).toHaveText("unauthenticated");
  expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_MARKER))
    .toMatch(/^pending:/);
  expect((await context.cookies()).some((cookie) => cookie.name === "staff-refresh-e2e"))
    .toBe(true);

  const countBeforeReload = refreshRequests;
  await page.reload();
  await expect(page.locator("#staff-auth-status")).toHaveText("unauthenticated");
  expect(refreshRequests).toBe(countBeforeReload);
  expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_MARKER))
    .toMatch(/^pending:/);
  await page.locator("#sign-in").click();
  await expect(page.locator("#staff-auth-status")).toHaveText("authenticated");
});
