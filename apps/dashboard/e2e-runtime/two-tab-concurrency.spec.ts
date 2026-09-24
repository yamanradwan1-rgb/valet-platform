import type { Page } from "@playwright/test";

import {
  assurePreEnrolled,
  controlFixture,
  runtimeFixture as f,
  selectCompany,
  signIn,
} from "./support/runtime-fixture";
import { expect, test } from "./support/runtime-test";

async function openBranding(page: Page): Promise<void> {
  await selectCompany(page);
  await page.getByRole("link", { name: "Branding" }).click();
  await expect(page.getByRole("heading", { name: "Branding" })).toBeVisible();
  await expect(page.getByLabel("Display name")).toHaveValue(f.organizations.a.name);
}

test("MFA assurance stays exact-session across separate browser contexts", async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await signIn(pageA, f.emails.conflictAdmin);
  await signIn(pageB, f.emails.conflictAdmin);
  await assurePreEnrolled(pageA);
  await expect(pageB.getByRole("status").filter({ hasText: "MFA status:" }))
    .toContainText("Verification required");

  await contextA.close();
  await contextB.close();
});

test("literal two-tab CAS conflict reloads authoritative state and requires explicit retry", async ({
  browser,
}) => {
  await controlFixture("branding-reset");
  const context = await browser.newContext();
  const pageB = await context.newPage();

  await signIn(pageB, f.emails.conflictAdmin);
  await assurePreEnrolled(pageB);
  const brandingReadPath =
    `/v1/staff/management/organizations/${f.organizations.a.id}/branding`;
  const staleRead = pageB.waitForResponse((response) =>
    response.request().method() === "GET" &&
    new URL(response.url()).pathname === brandingReadPath);
  await openBranding(pageB);
  const staleBranding = await (await staleRead).json() as { updatedAt: string };

  const pageA = await context.newPage();
  const pageARefresh = pageA.waitForResponse((response) =>
    response.request().method() === "POST" &&
    new URL(response.url()).pathname === "/v1/staff/auth/refresh");
  await pageA.goto("/branding");
  const pageAAccess = await (await pageARefresh).json() as { accessToken: string };
  await expect(
    pageA.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toBeVisible();
  await openBranding(pageA);

  await expect(pageA.getByLabel("Display name")).toHaveValue(f.organizations.a.name);
  await expect(pageB.getByLabel("Display name")).toHaveValue(f.organizations.a.name);

  const writePath =
    `/v1/staff/management/organizations/${f.organizations.a.id}/branding/default`;
  let writesA = 0;
  let writesB = 0;
  await pageA.route(`**${writePath}`, async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    writesA += 1;
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({ response });
  });
  pageB.on("request", (request) => {
    if (request.method() === "PUT" && new URL(request.url()).pathname === writePath) {
      writesB += 1;
    }
  });

  await pageA.getByLabel("Display name").fill("MD06 Tab A Brand");
  const saveA = pageA.getByRole("button", { name: "Save Display name" });
  const writeAResponse = pageA.waitForResponse((response) =>
    response.request().method() === "PUT" &&
    new URL(response.url()).pathname === writePath);
  await saveA.click();
  await expect(saveA).toBeDisabled();
  await saveA.evaluate((button: HTMLButtonElement) => button.click());
  expect((await writeAResponse).status()).toBe(200);
  await expect(pageA.getByLabel("Display name")).toHaveValue("MD06 Tab A Brand");
  expect(writesA).toBe(1);

  const conflictStatus = await pageB.evaluate(async ({ accessToken, body, path }) => {
    const response = await fetch(path, {
      method: "PUT",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return response.status;
  }, {
    accessToken: pageAAccess.accessToken,
    body: {
      setting: "brandDisplayName",
      value: "MD06 Stale Tab B Brand",
      expectedUpdatedAt: staleBranding.updatedAt,
    },
    path: writePath,
  });
  expect(conflictStatus).toBe(409);
  expect(writesB).toBe(1);
  await pageB.reload();
  await expect(
    pageB.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toBeVisible();
  await selectCompany(pageB, { ...f.organizations.a, name: "MD06 Tab A Brand" });
  await pageB.getByRole("link", { name: "Branding" }).click();
  await expect(pageB.getByRole("heading", { name: "Branding" })).toBeVisible();
  await expect(pageB.getByLabel("Display name")).toHaveValue("MD06 Tab A Brand");
  await expect(pageB.getByLabel("Display name")).not.toHaveValue("MD06 Stale Tab B Brand");

  await pageB.getByLabel("Display name").fill("MD06 Tab B Retry Brand");
  const retryResponse = pageB.waitForResponse((response) =>
    response.request().method() === "PUT" &&
    new URL(response.url()).pathname === writePath);
  await pageB.getByRole("button", { name: "Save Display name" }).click();
  expect((await retryResponse).status()).toBe(200);
  await expect(pageB.getByLabel("Display name")).toHaveValue("MD06 Tab B Retry Brand");
  expect(writesB).toBe(2);
  await pageA.reload();
  await expect(
    pageA.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toBeVisible();
  await selectCompany(pageA, { ...f.organizations.a, name: "MD06 Tab B Retry Brand" });
  await pageA.getByRole("link", { name: "Branding" }).click();
  await expect(pageA.getByLabel("Display name")).toHaveValue("MD06 Tab B Retry Brand");

  await context.close();
  await controlFixture("branding-reset");
});
