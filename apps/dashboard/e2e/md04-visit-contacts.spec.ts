import { expect, test, type Page, type Request } from "@playwright/test";

import { DashboardApiFixture, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  FULL_PHONE,
  MASKED_ENDING,
  customer,
  customerHistoryPath,
  historyReply,
  md04FeatureAuthority,
  vehicleHistoryPath,
  visitSearchPath,
  visitSearchReply,
} from "./support/md04-fixtures";

async function enterContacts(page: Page, fixture: DashboardApiFixture, email: string) {
  await fixture.install(page);
  await page.goto("/customers");
  await signInOnCurrentPage(page, email);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await expect(page.getByRole("heading", { name: "Visit Contacts", level: 1 })).toBeVisible();
}

function contactsOverride(viewer: "CA" | "LM") {
  return (path: string, request: Request) => {
    if (path === "/v1/staff/dashboard/feature-authority") {
      return md04FeatureAuthority(request, viewer);
    }
    if (path === visitSearchPath) return visitSearchReply(request, viewer);
    if (path === customerHistoryPath) return historyReply(request, viewer);
    if (path === vehicleHistoryPath) return historyReply(request, viewer, true);
    return undefined;
  };
}

async function submitName(page: Page, value: string) {
  await page.getByLabel("Search mode").selectOption("NAME");
  await page.getByLabel("Name").fill(value);
  await page.getByRole("button", { name: "Search", exact: true }).click();
}

test("Visit Contacts renders truthful search states, history, customerless visits and cursors", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: contactsOverride("CA"),
  });
  await enterContacts(page, fixture, "admin@example.com");
  await expect(page.getByText("Choose one search mode and submit a search.")).toBeVisible();

  await submitName(page, "Alex");
  await expect(page.getByText(/Multiple authorized matches/)).toBeVisible();
  await expect(page.getByText("Alex One", { exact: true })).toBeVisible();
  await expect(page.getByText("Alex Two", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByLabel("Search mode").selectOption("PHONE");
  await expect(page.getByText("Alex One", { exact: true })).toHaveCount(0);
  await page.getByLabel("Phone").fill("079");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("Phone One", { exact: true })).toBeVisible();
  await expect(page.getByText("Phone Two", { exact: true })).toBeVisible();
  await submitName(page, "Alex");

  const firstRow = page.locator("tbody tr").filter({ hasText: "Alex One" });
  await firstRow.getByRole("button", { name: "Details" }).click();
  const drawer = page.getByRole("dialog", { name: "Alex One" });
  await expect(drawer.getByText(FULL_PHONE, { exact: true }).first()).toBeVisible();
  await expect(drawer.getByRole("cell", { name: "Returning Contact" })).toBeVisible();
  await expect(drawer.getByText("Vehicles associated through visits")).toBeVisible();
  await drawer.getByRole("button", { name: /10-12345/ }).click();
  await expect(drawer.getByText("No associated Visit Contact")).toBeVisible();
  await expect(drawer.getByText("PARKED", { exact: true })).toBeVisible();
  await expect(drawer.getByText("—", { exact: true }).last()).toBeVisible();
  await drawer.getByRole("button", { name: "Next", exact: true }).click();
  await expect(drawer.getByText("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", { exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: "Previous" }).click();
  await expect(drawer.getByText("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", { exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: "Close" }).click();

  await submitName(page, "None");
  await expect(page.getByText(/No Visit Contacts match/)).toBeVisible();

  await page.getByLabel("Search mode").selectOption("PLATE");
  await page.getByLabel("Plate country").fill("JO");
  await page.getByLabel("Plate", { exact: true }).fill("10-12345");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("10-12345", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toHaveCount(0);

  await submitName(page, "Page");
  await expect(page.getByText("Page One", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page Two", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Previous" }).click();
  await expect(page.getByText("Page One", { exact: true })).toBeVisible();
  await submitName(page, "Alex");
  await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();
});

test("LM receives only masked final four and no correction controls or protected logging", async ({ page }) => {
  const consoleText: string[] = [];
  page.on("console", (message) => consoleText.push(message.text()));
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    override: contactsOverride("LM"),
  });
  await enterContacts(page, fixture, "manager@example.com");
  await expect(page.getByText("Authorized Locations", { exact: true })).toBeVisible();
  await submitName(page, "PrivateNeedle");
  await expect(page.getByText(MASKED_ENDING, { exact: false }).first()).toBeVisible();
  const html = await page.locator("html").evaluate((node) => node.outerHTML);
  expect(html).not.toContain(FULL_PHONE);
  expect(consoleText.join("\n")).not.toContain("PrivateNeedle");

  const row = page.locator("tbody tr").filter({ hasText: "Alex One" });
  await row.getByRole("button", { name: "Details" }).click();
  const drawer = page.getByRole("dialog", { name: "Alex One" });
  await expect(drawer.getByText(MASKED_ENDING, { exact: false }).first()).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Correct name" })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "Correct phone" })).toHaveCount(0);
  const drawerHtml = await drawer.evaluate((node) => node.outerHTML);
  expect(drawerHtml).not.toContain(FULL_PHONE);
  expect(drawerHtml.toLowerCase()).not.toContain("owner");
});

test("current Visit Contact denial wins between cursor pages", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    override: (path, request) => {
      if (path === "/v1/staff/dashboard/feature-authority") return md04FeatureAuthority(request, "LM");
      if (path === visitSearchPath) {
        const cursor = new URL(request.url()).searchParams.get("cursor");
        return cursor ? {
          status: 403,
          body: { code: "AUTHORIZATION_DENIED", message: "denied", requestId: "revoked" },
        } : visitSearchReply(request, "LM");
      }
      return undefined;
    },
  });
  await enterContacts(page, fixture, "manager@example.com");
  await submitName(page, "Page");
  await expect(page.getByText("Page One", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText(/Current server authority no longer allows/)).toBeVisible();
  await expect(page.getByText("Page One", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Page Two", { exact: true })).toHaveCount(0);
});

test("history authority loss clears stale contact rows, drawer and full phone", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (path, request) => {
      if (path === "/v1/staff/dashboard/feature-authority") return md04FeatureAuthority(request, "CA");
      if (path === visitSearchPath) return visitSearchReply(request, "CA");
      if (path === customerHistoryPath) {
        return new URL(request.url()).searchParams.has("cursor")
          ? {
              status: 403,
              body: { code: "AUTHORIZATION_DENIED", message: "denied", requestId: "history-revoked" },
            }
          : historyReply(request, "CA");
      }
      return undefined;
    },
  });
  await enterContacts(page, fixture, "admin@example.com");
  await submitName(page, "Alex");
  const row = page.locator("tbody tr").filter({ hasText: "Alex One" });
  await row.getByRole("button", { name: "Details" }).click();
  const drawer = page.getByRole("dialog", { name: "Alex One" });
  await expect(drawer.getByText(FULL_PHONE, { exact: true }).first()).toBeVisible();
  await drawer.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Alex One" })).toHaveCount(0);
  await expect(page.getByText(FULL_PHONE, { exact: true })).toHaveCount(0);
  await expect(page.getByText("Alex One", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Current server authority no longer allows/)).toBeVisible();
});

test("late Visit Contact success and failure cannot repaint a newer query", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (path, request) => {
      if (path === "/v1/staff/dashboard/feature-authority") return md04FeatureAuthority(request, "CA");
      if (path !== visitSearchPath) return undefined;
      const name = new URL(request.url()).searchParams.get("name");
      if (name === "Slow") return {
        body: { items: [customer("Old Slow", "CA")], matchState: "UNIQUE", mode: "NAME", nextCursor: null },
        delayMs: 450,
      };
      if (name === "Fail") return {
        status: 503,
        body: { code: "UNAVAILABLE", message: "old failure", requestId: "old-failure" },
        delayMs: 450,
      };
      return { body: { items: [customer("New Fast", "CA")], matchState: "UNIQUE", mode: "NAME", nextCursor: null } };
    },
  });
  await enterContacts(page, fixture, "admin@example.com");
  await submitName(page, "Slow");
  await page.getByLabel("Name").fill("Fast");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("New Fast", { exact: true })).toBeVisible();
  await page.waitForTimeout(550);
  await expect(page.getByText("Old Slow", { exact: true })).toHaveCount(0);

  await page.getByLabel("Name").fill("Fail");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByLabel("Name").fill("Fast2");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("New Fast", { exact: true })).toBeVisible();
  await page.waitForTimeout(550);
  await expect(page.getByText("The request could not be completed.", { exact: true })).toHaveCount(0);
});
