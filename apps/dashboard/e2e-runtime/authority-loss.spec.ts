import { expect, test } from "./support/runtime-test";

import {
  assurePreEnrolled,
  controlFixture,
  runtimeFixture as f,
  selectCompany,
  selectLocation,
  signIn,
} from "./support/runtime-fixture";

test("Company authority and entitlement loss invalidate an open Management page", async ({
  page,
}) => {
  await controlFixture("membership", "authorityAdmin", "active");
  await controlFixture("dashboard-entitlement", "on");
  await signIn(page, f.emails.authorityAdmin);
  await assurePreEnrolled(page);
  await selectCompany(page);

  await page.getByRole("link", { name: "Branding" }).click();
  await expect(page.getByRole("heading", { name: "Branding" })).toBeVisible();
  await page.getByLabel("Display name").fill("Unsaved authority-loss value");

  await controlFixture("dashboard-entitlement", "off");
  await page.getByRole("link", { name: "Analytics" }).click();
  await expect(
    page.getByText(
      "The requested Management resource is not available.",
    ),
  ).toBeVisible();
  await expect(page.getByTestId("md05-analytics-page")).toHaveCount(0);
  await expect(page.getByLabel("Display name")).toHaveCount(0);

  await controlFixture("dashboard-entitlement", "on");
  await page.getByRole("button", { name: "Change scope" }).click();
  await selectCompany(page);
  await page.getByRole("link", { name: "Branding" }).click();
  await expect(page.getByRole("heading", { name: "Branding" })).toBeVisible();
  await page.getByLabel("Display name").fill("Unsaved membership-loss value");

  await controlFixture("membership", "authorityAdmin", "inactive");
  await page.getByRole("link", { name: "Reports" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toBeVisible();
  await expect(page.getByTestId("md05-reports-page")).toHaveCount(0);
  await expect(page.getByLabel("Display name")).toHaveCount(0);

  await controlFixture("membership", "authorityAdmin", "active");
  await controlFixture("dashboard-entitlement", "on");
});

test("Location grant loss invalidates an open exact-Location form without a write probe", async ({
  page,
}) => {
  await controlFixture("grant", "locationManager", "on");
  await signIn(page, f.emails.locationManager);
  await selectLocation(page, f.organizations.a.name, f.locations.a.name);
  await page.getByRole("link", { name: "Branding" }).click();
  await expect(page.getByRole("heading", { name: "Branding" })).toBeVisible();
  await page.getByLabel("Display name").fill("Unsaved Location grant value");

  let writes = 0;
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.url().includes("/branding")) writes += 1;
  });
  await controlFixture("grant", "locationManager", "off");
  await page.getByRole("link", { name: "Reports" }).click();

  await expect(
    page.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toBeVisible();
  await expect(page.getByTestId("md05-reports-page")).toHaveCount(0);
  await expect(page.getByLabel("Display name")).toHaveCount(0);
  expect(writes).toBe(0);

  await controlFixture("grant", "locationManager", "on");
});

test("Company Admin role loss invalidates active use before protected content can continue", async ({
  page,
}) => {
  await signIn(page, f.emails.authorityAdmin);
  await assurePreEnrolled(page);
  await selectCompany(page);
  await page.getByRole("link", { name: "Branding" }).click();
  await expect(page.getByRole("heading", { name: "Branding" })).toBeVisible();
  await page.getByLabel("Display name").fill("Unsaved role-loss value");

  await controlFixture("role", "authorityAdmin", "employee");
  await page.getByRole("link", { name: "Reports" }).click();

  await expect(
    page.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toBeVisible();
  await expect(page.getByTestId("md05-reports-page")).toHaveCount(0);
  await expect(page.getByLabel("Display name")).toHaveCount(0);
});
