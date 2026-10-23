import { expect, test } from "./support/runtime-test";
import {
  assurePreEnrolled,
  runtimeFixture as f,
  selectCompany,
  signIn,
} from "./support/runtime-fixture";

test("Company analytics uses one Company request and zero Location fan-out", async ({ page }) => {
  await signIn(page, f.emails.exportAdmin);
  await assurePreEnrolled(page);
  await selectCompany(page);

  const companyPath =
    `/v1/staff/management/organizations/${f.organizations.a.id}/analytics/all-locations`;
  let companyReads = 0;
  let locationReads = 0;
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "GET" && pathname === companyPath) companyReads += 1;
    if (
      request.method() === "GET" &&
      /^\/v1\/staff\/dashboard\/locations\/[^/]+\/analytics\//u.test(pathname)
    ) {
      locationReads += 1;
    }
  });

  const initial = page.waitForResponse((item) =>
    item.request().method() === "GET" && new URL(item.url()).pathname === companyPath);
  await page.getByRole("link", { name: "Analytics" }).click();
  expect((await initial).status()).toBe(200);
  // The HTTP response can arrive before React finishes the initial render.
  await expect(page.getByTestId("analytics-card-value").first()).not.toHaveText("—");
  await page.getByRole("button", { name: "Custom" }).click();
  const dialog = page.getByRole("dialog", { name: "Select analytics period" });
  await dialog.getByLabel("From").fill("2026-09-01");
  await dialog.getByLabel("To").fill("2026-09-21");
  const apply = dialog.getByRole("button", { name: "Apply" });
  await expect(apply).toBeVisible();
  await expect(apply).toBeEnabled();
  await apply.focus();
  await expect(apply).toBeFocused();
  const response = page.waitForResponse((item) =>
    item.request().method() === "GET" && new URL(item.url()).pathname === companyPath);
  const startedAt = Date.now();
  // Keyboard activation is a user-facing Apply action and avoids retrying a
  // locator after the form submit synchronously unmounts its own dialog.
  await page.keyboard.press("Enter");
  const applied = await response;
  expect(applied.status()).toBe(200);
  const appliedQuery = new URL(applied.url()).searchParams;
  expect(appliedQuery.get("from")).toBe("2026-09-01");
  expect(appliedQuery.get("to")).toBe("2026-09-21");
  await expect(page.getByTestId("md05-analytics-page")).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect(Date.now() - startedAt).toBeLessThan(2_000);
  expect(companyReads).toBe(2);
  expect(locationReads).toBe(0);
});
