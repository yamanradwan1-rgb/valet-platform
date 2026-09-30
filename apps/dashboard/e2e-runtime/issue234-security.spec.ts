import { expect, test } from "./support/runtime-test";
import {
  assurePreEnrolled,
  controlFixture,
  runtimeFixture as f,
  selectCompany,
  signIn,
  totp,
} from "./support/runtime-fixture";

test.use({ trace: "off", screenshot: "off", video: "off" });

test("#234 real Security route is scopeless, shell-native, and uses real MFA", async ({
  page,
}) => {
  const businessReads: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      path === "/v1/staff/management/organizations" ||
      path === "/v1/staff/dashboard/organizations" ||
      path === "/v1/staff/operational-context"
    ) {
      businessReads.push(path);
    }
  });

  await page.goto("/security");
  await page.getByLabel("Email").fill(f.emails.conflictAdmin);
  await page.getByLabel("Password").fill(
    process.env.E2E_STAFF_PASSWORD ?? "md06 browser password",
  );
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.locator(".shell")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Security", level: 1 })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Verification required");
  await expect(page.locator(".sidebar").getByText(f.organizations.a.name)).toHaveCount(0);
  await expect(page.locator(".topbar").getByText(f.locations.a.name)).toHaveCount(0);
  expect(businessReads).toEqual([]);

  await page.getByLabel("6-digit authenticator code").fill(totp(f.preEnrolledSecret));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("status")).toContainText("Verified");
  await expect(page.getByRole("link", { name: "Security" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(businessReads).toEqual([]);
});

test("#234 real sensitive freshness is independent from ordinary ASSURED state", async ({
  page,
}) => {
  await controlFixture("branding-reset");
  const accessToken = await signIn(page, f.emails.conflictAdmin);
  await assurePreEnrolled(page);
  await selectCompany(page);
  await page.getByRole("link", { name: "Branding" }).click();
  await expect(page.getByRole("heading", { name: "Branding" })).toBeVisible();
  await page.getByLabel("Display name").fill("Issue 234 Freshness Brand");

  await controlFixture("age-mfa", "conflictAdmin", "6");
  const ordinaryState = await page.evaluate(async ({ token }) => {
    const response = await fetch("/v1/staff/auth/mfa/state", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return { status: response.status, body: await response.json() as { state?: string } };
  }, { token: accessToken });
  expect(ordinaryState).toEqual({ status: 200, body: { state: "ASSURED" } });

  const writePath =
    `/v1/staff/management/organizations/${f.organizations.a.id}/branding/default`;
  let writes = 0;
  page.on("request", (request) => {
    if (request.method() === "PUT" && new URL(request.url()).pathname === writePath) {
      writes += 1;
    }
  });

  const denied = page.waitForResponse((response) =>
    response.request().method() === "PUT" &&
    new URL(response.url()).pathname === writePath,
  );
  await page.getByRole("button", { name: "Save Display name" }).click();
  expect((await denied).status()).toBe(403);
  expect(writes).toBe(1);

  const dialog = page.getByRole("dialog", { name: "Verification required" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("6-digit authenticator code")).toBeVisible();
  await dialog.getByLabel("6-digit authenticator code").fill(totp(f.preEnrolledSecret, 1));
  await dialog.getByRole("button", { name: "Verify" }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toBe(1);

  const explicitRetry = page.waitForResponse((response) =>
    response.request().method() === "PUT" &&
    new URL(response.url()).pathname === writePath,
  );
  await page.getByRole("button", { name: "Save Display name" }).click();
  expect((await explicitRetry).status()).toBe(200);
  expect(writes).toBe(2);
  await controlFixture("branding-reset");
});
