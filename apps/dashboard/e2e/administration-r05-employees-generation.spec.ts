import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  ORG_A,
  ORG_B,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { staffItem, staffPath } from "./support/administration-r05-fixtures";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function signInCompany(page: Page) {
  await page.goto("/employees");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
}

async function changeOrganization(page: Page, organizationName: string) {
  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await page.getByRole("button", { name: organizationName }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
}

for (const mode of ["success", "failure"] as const) {
  test(`R05 Employees A→B→A fences stale first-A ${mode}`, async ({ page }) => {
    const pathA = staffPath(ORG_A.organizationId);
    const pathB = staffPath(ORG_B.organizationId);
    const started = deferred();
    const release = deferred();
    let aCalls = 0;
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A, ORG_B],
      override: async (path) => {
        if (path === pathA) {
          aCalls += 1;
          if (aCalls === 1) {
            started.resolve();
            await release.promise;
            return mode === "success"
              ? { body: { items: [staffItem({ identity: { email: "stale-a@example.com" } })], nextCursor: null } }
              : { status: 503, body: { code: "TEMPORARY", message: "stale employee failure", requestId: "r05-stale-employee" } };
          }
          return { body: { items: [staffItem({ identity: { email: "fresh-a@example.com" } })], nextCursor: null } };
        }
        if (path === pathB) {
          return { body: { items: [staffItem({ identity: { email: "bravo@example.com" } })], nextCursor: null } };
        }
        return undefined;
      },
    });
    await fixture.install(page);
    await signInCompany(page);
    await started.promise;

    await changeOrganization(page, ORG_B.name);
    await expect(page.getByText("bravo@example.com", { exact: true })).toBeVisible();
    await changeOrganization(page, ORG_A.name);
    await expect(page.getByText("fresh-a@example.com", { exact: true })).toBeVisible();

    release.resolve();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("fresh-a@example.com", { exact: true })).toBeVisible();
    await expect(page.getByText("stale-a@example.com", { exact: true })).toHaveCount(0);
    await expect(page.getByText("stale employee failure", { exact: true })).toHaveCount(0);
  });
}

test("R05 Employees resets cursor history when returning A after B", async ({ page }) => {
  const pathA = staffPath(ORG_A.organizationId);
  const pathB = staffPath(ORG_B.organizationId);
  const seenA: Array<string | null> = [];
  const seenB: Array<string | null> = [];
  const oldPageStarted = deferred();
  const oldPageRelease = deferred();
  let returningA = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A, ORG_B],
    override: async (path, request) => {
      const cursor = new URL(request.url()).searchParams.get("cursor");
      if (path === pathA) {
        seenA.push(cursor);
        if (cursor === "A_CURSOR") {
          oldPageStarted.resolve();
          await oldPageRelease.promise;
          return { body: { items: [staffItem({ identity: { email: "stale-a-page2@example.com" } })], nextCursor: null } };
        }
        const email = returningA ? "a-return@example.com" : "a-first@example.com";
        return { body: { items: [staffItem({ identity: { email } })], nextCursor: returningA ? null : "A_CURSOR" } };
      }
      if (path === pathB) {
        seenB.push(cursor);
        return cursor === null
          ? { body: { items: [staffItem({ identity: { email: "b-first@example.com" } })], nextCursor: "B_CURSOR" } }
          : { body: { items: [staffItem({ identity: { email: "b-second@example.com" } })], nextCursor: null } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await signInCompany(page);
  await expect(page.getByText("a-first@example.com", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await oldPageStarted.promise;

  await changeOrganization(page, ORG_B.name);
  await expect(page.getByText("b-first@example.com", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("b-second@example.com", { exact: true })).toBeVisible();
  const aSeenBeforeReturn = seenA.length;
  returningA = true;
  await changeOrganization(page, ORG_A.name);
  await expect(page.getByText("a-return@example.com", { exact: true })).toBeVisible();

  const returnCursors = seenA.slice(aSeenBeforeReturn);
  expect(returnCursors.length).toBeGreaterThan(0);
  expect(returnCursors.every((cursor) => cursor === null)).toBe(true);
  expect(seenA).toContain("A_CURSOR");
  expect(seenB).toContain("B_CURSOR");
  expect(seenA).not.toContain("B_CURSOR");
  expect(seenB).not.toContain("A_CURSOR");
  oldPageRelease.resolve();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("a-return@example.com", { exact: true })).toBeVisible();
  await expect(page.getByText("stale-a-page2@example.com", { exact: true })).toHaveCount(0);
});

for (const mode of ["success", "failure"] as const) {
  test(`R05 pending Employees ${mode} cannot repaint after logout`, async ({ page }) => {
    const path = staffPath(ORG_A.organizationId);
    const started = deferred();
    const release = deferred();
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      override: async (requestPath) => {
        if (requestPath !== path) return undefined;
        started.resolve();
        await release.promise;
        return mode === "success"
          ? { body: { items: [staffItem({ identity: { email: "logged-out-stale@example.com" } })], nextCursor: null } }
          : { status: 503, body: { code: "TEMPORARY", message: "logged-out stale failure", requestId: "r05-logout-stale" } };
      },
    });
    await fixture.install(page);
    await signInCompany(page);
    await started.promise;
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    release.resolve();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByText("logged-out-stale@example.com", { exact: true })).toHaveCount(0);
    await expect(page.getByText("logged-out stale failure", { exact: true })).toHaveCount(0);
  });
}

test("R05 replacement session fences the prior pending Employees result", async ({ page }) => {
  const path = staffPath(ORG_A.organizationId);
  const started = deferred();
  const release = deferred();
  let calls = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: async (requestPath) => {
      if (requestPath !== path) return undefined;
      calls += 1;
      if (calls === 1) {
        started.resolve();
        await release.promise;
        return { body: { items: [staffItem({ identity: { email: "old-session@example.com" } })], nextCursor: null } };
      }
      return { body: { items: [staffItem({ identity: { email: "replacement-session@example.com" } })], nextCursor: null } };
    },
  });
  await fixture.install(page);
  await signInCompany(page);
  await started.promise;
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await signInOnCurrentPage(page, "replacement-admin@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect(page.getByText("replacement-session@example.com", { exact: true })).toBeVisible();

  release.resolve();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("replacement-session@example.com", { exact: true })).toBeVisible();
  await expect(page.getByText("old-session@example.com", { exact: true })).toHaveCount(0);
});
