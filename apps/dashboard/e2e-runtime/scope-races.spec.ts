import type { Page } from "@playwright/test";

import { installDelayedRealResponse } from "./support/delayed-real-response";
import { expect, test } from "./support/runtime-test";
import {
  assurePreEnrolled,
  controlFixture,
  runtimeFixture as f,
  selectCompany,
  selectLocation,
  signIn,
} from "./support/runtime-fixture";

async function changeScope(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Change scope" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toBeVisible();
}

test("Organization A→B→A ignores delayed old real success and lost old response", async ({
  page,
}) => {
  await controlFixture("branding-reset");
  await signIn(page, f.emails.multiAdmin);
  await assurePreEnrolled(page);
  await selectCompany(page, f.organizations.a);

  const aBranding =
    `/v1/staff/management/organizations/${f.organizations.a.id}/branding`;
  const delayed = await installDelayedRealResponse(
    page,
    (request) =>
      request.method() === "GET" && new URL(request.url()).pathname === aBranding,
  );

  const oldSuccess = delayed.arm("success");
  await page.getByRole("link", { name: "Branding" }).click();
  await oldSuccess.started;
  await changeScope(page);
  await selectCompany(page, f.organizations.b);
  await expect(page.getByLabel("Primary color")).toHaveValue("#176BFF");

  await controlFixture("branding-color", "#112233");
  await changeScope(page);
  await selectCompany(page, f.organizations.a);
  await expect(page.getByLabel("Primary color")).toHaveValue("#112233");
  oldSuccess.release();
  await page.waitForTimeout(150);
  await expect(page.getByLabel("Primary color")).toHaveValue("#112233");

  await changeScope(page);
  await selectCompany(page, f.organizations.b);
  await controlFixture("branding-color", "#223344");
  const oldFailure = delayed.arm("failure");
  await changeScope(page);
  await selectCompany(page, f.organizations.a);
  await oldFailure.started;

  await changeScope(page);
  await selectCompany(page, f.organizations.b);
  await controlFixture("branding-color", "#334455");
  await changeScope(page);
  await selectCompany(page, f.organizations.a);
  await expect(page.getByLabel("Primary color")).toHaveValue("#334455");
  oldFailure.release();
  await page.waitForTimeout(150);
  await expect(page.getByLabel("Primary color")).toHaveValue("#334455");
  await expect(page.getByTestId("md02-page").getByRole("alert")).toHaveCount(0);

  await controlFixture("branding-reset");
});

test("Location A→B→A fences delayed real results across feature ownership", async ({
  page,
}) => {
  await controlFixture("grant", "locationManager", "on");
  await controlFixture("branding-reset");
  await controlFixture("location-branding-name", "a", "Location A old");
  await signIn(page, f.emails.locationManager);
  await selectLocation(page, f.organizations.a.name, f.locations.a.name);

  const aBranding = `/v1/staff/dashboard/locations/${f.locations.a.id}/branding`;
  const delayed = await installDelayedRealResponse(
    page,
    (request) =>
      request.method() === "GET" && new URL(request.url()).pathname === aBranding,
  );
  const oldSuccess = delayed.arm("success");
  await page.getByRole("link", { name: "Branding" }).click();
  await oldSuccess.started;

  await changeScope(page);
  await selectLocation(page, f.organizations.a.name, f.locations.b.name);
  await controlFixture("location-branding-name", "a", "Location A fresh");
  await changeScope(page);
  await selectLocation(page, f.organizations.a.name, f.locations.a.name);
  await expect(page.getByLabel("Display name")).toHaveValue("Location A fresh");
  oldSuccess.release();
  await page.waitForTimeout(150);
  await expect(page.getByLabel("Display name")).toHaveValue("Location A fresh");

  await changeScope(page);
  await selectLocation(page, f.organizations.a.name, f.locations.b.name);
  await controlFixture("location-branding-name", "a", "Location A stale failure");
  const oldFailure = delayed.arm("failure");
  await changeScope(page);
  await selectLocation(page, f.organizations.a.name, f.locations.a.name);
  await oldFailure.started;
  await changeScope(page);
  await selectLocation(page, f.organizations.a.name, f.locations.b.name);
  await controlFixture("location-branding-name", "a", "Location A latest");
  await changeScope(page);
  await selectLocation(page, f.organizations.a.name, f.locations.a.name);
  await expect(page.getByLabel("Display name")).toHaveValue("Location A latest");
  oldFailure.release();
  await page.waitForTimeout(150);
  await expect(page.getByLabel("Display name")).toHaveValue("Location A latest");
  await expect(page.getByTestId("md02-page").getByRole("alert")).toHaveCount(0);

  const navigation = page.getByRole("navigation", { name: "Management navigation" });
  await navigation.getByRole("link", { name: "Maps & Zones" }).click();
  await expect(page.getByRole("heading", { name: /Maps/u })).toBeVisible();
  await navigation.getByRole("link", { name: "Audit Log" }).click();
  await expect(page.getByRole("heading", { name: "Audit Log" })).toBeVisible();
  await navigation.getByRole("link", { name: "Reports" }).click();
  await expect(page.getByTestId("md05-reports-page")).toBeVisible();

  await controlFixture("branding-reset");
});
