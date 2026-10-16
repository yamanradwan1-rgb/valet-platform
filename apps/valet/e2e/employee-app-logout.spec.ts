import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const TOKEN = "vsa1.0123456789012345678901234567890123456789012";
const TOKEN_B = "vsa1.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";
const MARKER = "vaylet.staff.auth-boundary.v1";
let fixtureUrl = "";
let stopServer: (() => Promise<void>) | undefined;

test.beforeAll(async () => {
  const requireFromPackage = createRequire(`${process.cwd()}/package.json`);
  const viteEntry = createRequire(requireFromPackage.resolve("vitest")).resolve("vite");
  const { createServer } = await import(pathToFileURL(viteEntry).href);
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    esbuild: { jsx: "automatic", jsxImportSource: "react" },
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  fixtureUrl = `${server.resolvedUrls?.local[0]}e2e/employee-app-logout-browser-fixture.html`;
  stopServer = () => server.close();
});

test.afterAll(async () => {
  await stopServer?.();
});

async function signInToActualEmployeeApp(page: Page): Promise<void> {
  await page.route("**/v1/staff/auth/refresh", (route) => route.fulfill({ status: 401 }));
  await page.route("**/v1/staff/auth/login", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      accessToken: TOKEN,
      tokenType: "Bearer",
      accessExpiresAt: "2028-01-01T00:00:00.000Z",
      sessionExpiresAt: "2028-02-01T00:00:00.000Z",
    }),
  }));
  await page.route("**/v1/staff/operational-context", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ contexts: [] }),
  }));
  await page.goto(fixtureUrl);
  await page.locator('input[type="email"]').fill("worker@example.com");
  await page.locator('input[type="password"]').fill("Password123!");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText("No active shift")).toBeVisible();
}

test("actual Employee App handles rejected logout, shows honest retry on access gate, then clears it", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await signInToActualEmployeeApp(page);
  let logoutRequests = 0;
  await page.route("**/v1/staff/auth/logout", (route) => {
    logoutRequests++;
    return logoutRequests === 1 ? route.abort("failed") : route.fulfill({ status: 204 });
  });
  await page.getByRole("button", { name: "Sign Out" }).click();
  await expect(page.getByRole("alert")).toContainText("Sign-out is not confirmed");
  await expect(page.getByRole("button", { name: "Retry Sign Out" })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), MARKER)).toMatch(/^pending:/);
  await page.getByRole("button", { name: "Retry Sign Out" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), MARKER)).toMatch(/^signed-out:/);
  expect(logoutRequests).toBe(2);
  expect(pageErrors).toEqual([]);
});

test("actual Employee App retains identity on storage error and failed POST, retries server revocation", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await signInToActualEmployeeApp(page);
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new Error("origin storage unavailable");
      return original.call(this, name, value);
    };
  }, MARKER);
  let requests = 0;
  await page.route("**/v1/staff/auth/logout", (route) => {
    requests++;
    return requests === 1 ? route.abort("failed") : route.fulfill({ status: 204 });
  });
  await page.getByRole("button", { name: "Sign Out" }).click();
  await expect(page.getByRole("alert")).toContainText("Your session may still be active");
  await expect(page.getByText("No active shift")).toBeVisible();
  await page.getByRole("button", { name: "Retry Sign Out" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  expect(requests).toBe(2);
  expect(pageErrors).toEqual([]);
});

test("delayed A logout blocks interactive B login until bounded abort, then B can login and logout", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.clock.install();
  await signInToActualEmployeeApp(page);

  let finishOldRequest!: () => void;
  const oldRequestHeld = new Promise<void>((resolve) => { finishOldRequest = resolve; });
  let signalOldRequest!: () => void;
  const oldRequestArrived = new Promise<void>((resolve) => { signalOldRequest = resolve; });
  let logoutRequests = 0;
  await page.route("**/v1/staff/auth/logout", async (route) => {
    logoutRequests++;
    if (logoutRequests === 1) {
      signalOldRequest();
      await oldRequestHeld;
      // An aborted response must never replace a subsequent B login cookie.
      try {
        await route.fulfill({
          status: 204,
          headers: { "Set-Cookie": "staff-fixture=A; Path=/; SameSite=Lax" },
        });
      } catch { /* expected when A request was aborted */ }
      return;
    }
    await route.fulfill({
      status: 204,
      headers: { "Set-Cookie": "staff-fixture=; Max-Age=0; Path=/; SameSite=Lax" },
    });
  });

  await page.getByRole("button", { name: "Sign Out" }).click();
  await oldRequestArrived;
  await expect(page.getByRole("status")).toContainText("Signing out");
  await expect(page.getByRole("button", { name: "Sign In" })).toHaveCount(0);
  await expect(page.locator('input[type="email"]')).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), MARKER)).toMatch(/^pending:/);

  await page.clock.fastForward(15_100);
  await expect(page.getByRole("alert")).toContainText("not confirmed");
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  // Deliberate B sign-in begins only after the aborted A request is settled.
  await page.route("**/v1/staff/auth/login", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "Set-Cookie": "staff-fixture=B; Path=/; SameSite=Lax" },
    body: JSON.stringify({
      accessToken: TOKEN_B,
      tokenType: "Bearer",
      accessExpiresAt: "2028-01-01T00:00:00.000Z",
      sessionExpiresAt: "2028-02-01T00:00:00.000Z",
    }),
  }));
  await page.locator('input[type="email"]').fill("second@example.com");
  await page.locator('input[type="password"]').fill("SecondPassword123!");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText("No active shift")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(await page.evaluate(() => document.cookie)).toContain("staff-fixture=B");

  finishOldRequest();
  await expect(page.getByText("No active shift")).toBeVisible();
  expect(await page.evaluate(() => document.cookie)).toContain("staff-fixture=B");
  await page.getByRole("button", { name: "Sign Out" }).click();
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  expect(logoutRequests).toBe(2);
  expect(pageErrors).toEqual([]);
});

test("unmount aborts A logout and remounted EmployeeApp fences B until A settles", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await signInToActualEmployeeApp(page);

  let finishOldRequest!: () => void;
  const oldRequestHeld = new Promise<void>((resolve) => { finishOldRequest = resolve; });
  let signalOldRequest!: () => void;
  const oldRequestArrived = new Promise<void>((resolve) => { signalOldRequest = resolve; });
  let logoutRequests = 0;
  await page.route("**/v1/staff/auth/logout", async (route) => {
    logoutRequests++;
    if (logoutRequests === 1) {
      signalOldRequest();
      await oldRequestHeld;
      try {
        await route.fulfill({ status: 204,
          headers: { "Set-Cookie": "staff-fixture=A; Path=/; SameSite=Lax" } });
      } catch { /* A was aborted by the original component's unmount */ }
      return;
    }
    await route.fulfill({ status: 204 });
  });

  await page.getByRole("button", { name: "Sign Out" }).click();
  await oldRequestArrived;
  await expect(page.getByRole("button", { name: "Sign In" })).toHaveCount(0);
  await page.evaluate(() => {
    (window as Window & { __remountEmployeeApp(): void }).__remountEmployeeApp();
  });
  // An unmount aborts A, and the new mount cannot use the old sign-in form
  // until that request has rejected and released the shared same-tab fence.
  await expect(page.getByRole("alert")).toContainText("not confirmed");
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();

  await page.route("**/v1/staff/auth/login", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "Set-Cookie": "staff-fixture=B; Path=/; SameSite=Lax" },
    body: JSON.stringify({
      accessToken: TOKEN_B,
      tokenType: "Bearer",
      accessExpiresAt: "2028-01-01T00:00:00.000Z",
      sessionExpiresAt: "2028-02-01T00:00:00.000Z",
    }),
  }));
  await page.locator('input[type="email"]').fill("second@example.com");
  await page.locator('input[type="password"]').fill("SecondPassword123!");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText("No active shift")).toBeVisible();
  expect(await page.evaluate(() => document.cookie)).toContain("staff-fixture=B");
  finishOldRequest();
  expect(await page.evaluate(() => document.cookie)).toContain("staff-fixture=B");
  await page.getByRole("button", { name: "Sign Out" }).click();
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  expect(logoutRequests).toBe(2);
  expect(pageErrors).toEqual([]);
});
