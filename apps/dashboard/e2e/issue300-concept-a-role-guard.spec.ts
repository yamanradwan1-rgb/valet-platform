import { expect, test, type Request } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
  supervisorContext,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { md04AuditReply } from "./support/md04-audit-fixtures";
import { md04FeatureAuthority } from "./support/md04-fixtures";

function auditCalls(fixture: DashboardApiFixture): number {
  return [...fixture.counts.entries()]
    .filter(([path]) => path.endsWith("/audit-events"))
    .reduce((count, [, value]) => count + value, 0);
}

function replyFor(role: "CA" | "LM" | "SUPERVISOR") {
  return (path: string, request: Request) =>
    path === "/v1/staff/dashboard/feature-authority"
      ? md04FeatureAuthority(request, role)
      : md04AuditReply(path, request, role);
}

for (const identity of [
  { label: "Company Admin", role: "CA", email: "admin@example.com" },
  { label: "Location Manager", role: "LM", email: "manager@example.com" },
] as const) {
  test("Issue #300 " + identity.label + " can review local demo without fetching live Audit Events", async ({ page }) => {
    const fixture = new DashboardApiFixture({
      ...(identity.role === "CA"
        ? {
            companyOrganizations: [ORG_A],
            companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
          }
        : {
            locationManagerOrganizations: [ORG_A],
            locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
          }),
      override: replyFor(identity.role),
    });
    await fixture.install(page);
    await page.goto("/audit-log?investigationDemo=1");
    await signInOnCurrentPage(page, identity.email);
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page.getByRole("button", { name: LOCATION_A.name }).click();

    const review = page.getByRole("tab", { name: "Investigation Search" });
    await expect(review).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("note")).toContainText("Fictional event references");
    expect(auditCalls(fixture)).toBe(0);

    const form = page.getByRole("form", { name: "Find Sessions" });
    await form.locator('button[type="submit"]').click();
    const results = page.locator('[class*="choiceList"] button[aria-pressed]');
    await expect(results).toHaveCount(3);
    await results.filter({ hasText: "Kia Sportage" }).click();
    await expect(page.locator("li[data-kind]")).toHaveCount(5);
    const incident = page.getByRole("button", { name: /INC-304/u });
    await incident.click();
    const modal = page.getByRole("dialog");
    const close = modal.getByRole("button", { name: "Close details" });
    await expect(modal).toHaveAttribute("aria-modal", "true");
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(modal.getByRole("button", { name: /^Help:/ })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await modal.getByRole("button", { name: /^Help:/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(2);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(modal).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
    await expect(incident).toBeFocused();
    expect(auditCalls(fixture), "demo-only view must not fetch management Audit API").toBe(0);

    await page.getByRole("tab", { name: "Audit Events" }).click();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(1);
    expect(auditCalls(fixture)).toBeGreaterThan(0);
  });
}

test("Issue #300 Supervisor remains in the ordinary restricted Audit Events view", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    operationalContexts: [supervisorContext()],
    override: replyFor("SUPERVISOR"),
  });
  await fixture.install(page);
  await page.goto("/audit-log?investigationDemo=1");
  await signInOnCurrentPage(page, "supervisor@example.com");
  await page.getByRole("button", { name: ORG_A.name + " · " + LOCATION_A.name }).click();

  await expect(page.getByRole("heading", { name: "Audit Log" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Investigation Search" })).toHaveCount(0);
  await expect(page.getByRole("note")).toHaveCount(0);
  await expect(page.getByRole("form", { name: "Find Sessions" })).toHaveCount(0);
  await expect(page.getByRole("table")).toContainText("Vehicle parked");
  await expect(page.getByLabel("Event type")).toHaveCount(0);
  expect(auditCalls(fixture)).toBeGreaterThan(0);
});

test("Issue #300 local Dashboard sidebar Audit route exposes the authorized review tab but defaults to real Audit Events", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: replyFor("CA"),
  });
  await fixture.install(page);
  await page.goto("/audit-log");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();

  const investigation = page.getByRole("tab", { name: "Investigation Search" });
  await expect(investigation).toBeVisible();
  await expect(page.getByRole("tab", { name: "Audit Events" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByLabel("Event type")).toBeVisible();
  expect(auditCalls(fixture)).toBeGreaterThan(0);

  const before = auditCalls(fixture);
  await investigation.click();
  await expect(investigation).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("form", { name: "Find Sessions" })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  expect(auditCalls(fixture)).toBe(before);
});
