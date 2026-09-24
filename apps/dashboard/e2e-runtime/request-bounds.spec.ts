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

  await page.getByRole("link", { name: "Analytics" }).click();
  await page.getByRole("button", { name: "Select period" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Select analytics period" });
  await dialog.getByLabel("From").fill("2026-09-01");
  await dialog.getByLabel("To").fill("2026-09-21");
  const response = page.waitForResponse((item) =>
    item.request().method() === "GET" && new URL(item.url()).pathname === companyPath);
  const startedAt = Date.now();
  await dialog.getByRole("button", { name: "Apply" }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByTestId("md05-analytics-page")).toBeVisible();
  expect(Date.now() - startedAt).toBeLessThan(2_000);
  expect(companyReads).toBe(1);
  expect(locationReads).toBe(0);
});
