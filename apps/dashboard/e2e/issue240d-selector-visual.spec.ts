import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  fillCreate,
  openEmployees,
  PENDING_DETAIL,
  PENDING_STAFF,
  STAFF_BASE,
} from "./support/issue240d-onboarding";

test.use({ trace: "off" });
test("Create selector pages only on explicit navigation and retains multiple selected Locations", async ({
  page,
}) => {
  let posts = 0;
  const candidates = `/v1/staff/management/organizations/${ORG_A.organizationId}/locations`;
  let paging = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (paging && path === candidates) {
        const second = new URL(request.url()).searchParams.has("cursor");
        return {
          body: {
            items: [second ? LOCATION_B : LOCATION_A],
            nextCursor: second ? null : "SECOND_PAGE",
          },
        };
      }
      if (path === STAFF_BASE && request.method() === "POST") {
        posts++;
        expect((request.postDataJSON().locationIds as string[]).length).toBe(2);
        return {
          status: 409,
          body: {
            code: "STAFF_ONBOARDING_UNAVAILABLE",
            message: "Unavailable",
            requestId: "240d-page",
          },
        };
      }
      if (path === STAFF_BASE) return { body: { items: [], nextCursor: null } };
      return undefined;
    },
  });
  await openEmployees(page, fixture);
  paging = true;
  const before = fixture.count(candidates);
  await page
    .getByRole("button", { name: "Create Employee", exact: true })
    .click();
  const dialog = await fillCreate(page);
  expect(fixture.count(candidates) - before).toBe(1);
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(dialog.getByRole("checkbox")).not.toBeChecked();
  await dialog.getByRole("checkbox").check();
  expect(fixture.count(candidates) - before).toBe(2);
  await dialog.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(dialog.getByRole("checkbox")).toBeChecked();
  expect(fixture.count(candidates) - before).toBe(3);
  await dialog
    .getByRole("button", { name: "Create Employee", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect(posts).toBe(1);
});

test("Arabic dark narrow Create/pending drawer preserve focus, mixed identity and avoid page overflow", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 480, height: 900 });
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) =>
      path === STAFF_BASE
        ? { body: { items: [PENDING_STAFF], nextCursor: null } }
        : path === `${STAFF_BASE}/${PENDING_STAFF.membershipId}`
          ? { body: PENDING_DETAIL }
          : undefined,
  });
  await openEmployees(page, fixture);
  await page
    .getByRole("group", { name: "Theme" })
    .getByRole("button")
    .nth(1)
    .click();
  await page.getByRole("button", { name: "Language", exact: true }).click();
  const trigger = page.getByRole("button", { name: "إنشاء موظف", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "إنشاء موظف", exact: true });
  await expect(dialog.getByLabel("الاسم الأول")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "إغلاق" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByLabel("الاسم الأول")).toBeFocused();
  await page.screenshot({ path: info.outputPath("create-ar-dark-narrow.png") });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.getByRole("table").getByRole("button").first().click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "إعادة إنشاء الدعوة" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("pending@example.test"),
  ).toHaveAttribute("dir", "ltr");
  await page.screenshot({
    path: info.outputPath("pending-ar-dark-narrow.png"),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
