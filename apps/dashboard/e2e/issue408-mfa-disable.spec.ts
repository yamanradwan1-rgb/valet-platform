import { expect, test } from "@playwright/test";
import {
  Issue408MfaFixture,
  disablePath,
  openDisable,
  openSecurity,
} from "./support/issue408-mfa-fixture";

test("requires explicit fresh proof, commits once, reconciles, reloads and offers re-enrollment", async ({
  page,
}) => {
  const f = new Issue408MfaFixture();
  await openSecurity(page, f);
  expect(f.posts).toHaveLength(0);
  const dialog = await openDisable(page);
  await expect(
    dialog.getByRole("button", { name: "Confirm and disable MFA" }),
  ).toBeDisabled();
  await dialog.getByLabel("6-digit authenticator code").fill("123456");
  await dialog.getByRole("button", { name: "Confirm and disable MFA" }).click();
  await expect(
    page.getByRole("button", { name: "Set up authenticator" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "MFA is not enabled." }),
  ).toBeVisible();
  expect(f.posts).toEqual([{ expectedFactorId: f.factorId, code: "123456" }]);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Set up authenticator" }),
  ).toBeVisible();
  expect(f.posts).toHaveLength(1);
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  await expect(
    page.getByRole("heading", { name: "Authenticator setup" }),
  ).toBeVisible();
  await page.getByLabel("6-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Confirm authenticator" }).click();
  await expect(
    page.getByRole("heading", { name: "Recovery codes", exact: true }),
  ).toBeVisible();
  await expect(page.locator("ol li")).toHaveCount(10);
  await page.getByRole("button", { name: "I saved these codes" }).click();
  await expect(
    page.getByRole("button", { name: "Disable MFA", exact: true }),
  ).toBeVisible();
  expect(f.posts).toHaveLength(1);
});
test("mandatory policy has explanation and no actionable disable", async ({
  page,
}) => {
  const f = new Issue408MfaFixture();
  f.availability = "MFA_REQUIRED_BY_POLICY";
  await openSecurity(page, f);
  await expect(
    page.getByText("Your account is required to use MFA.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Disable MFA", exact: true }),
  ).toHaveCount(0);
  expect(f.posts).toHaveLength(0);
});
test("not enabled preserves the setup path without a disable action", async ({
  page,
}) => {
  const f = new Issue408MfaFixture();
  f.commit();
  await openSecurity(page, f);
  await expect(
    page.getByRole("button", { name: "Set up authenticator" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Disable MFA", exact: true }),
  ).toHaveCount(0);
});
test("keyboard cancellation and Escape return focus and never submit", async ({
  page,
}) => {
  const f = new Issue408MfaFixture();
  await openSecurity(page, f);
  const dialog = await openDisable(page);
  await dialog.getByLabel("6-digit authenticator code").fill("123456");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Disable MFA", exact: true }),
  ).toBeFocused();
  expect(f.posts).toHaveLength(0);
});
// All state-changing attempts below require another explicit click.
for (const outcome of [
  "invalid",
  "busy",
  "changed",
  "policy",
  "unknown",
  "session",
] as const) {
  test(`${outcome} feedback never automatically replays POST`, async ({
    page,
  }) => {
    const f = new Issue408MfaFixture();
    f.outcome = outcome;
    await openSecurity(page, f);
    const dialog = await openDisable(page);
    await dialog.getByLabel("6-digit authenticator code").fill("123456");
    await dialog
      .getByRole("button", { name: "Confirm and disable MFA" })
      .click();
    if (outcome === "invalid") {
      await expect(dialog.getByRole("alert")).toHaveText(
        "The verification code was not accepted.",
      );
      await expect(dialog.getByLabel("6-digit authenticator code")).toHaveValue(
        "",
      );
    } else {
      await expect(dialog).toHaveCount(0);
      if (outcome === "unknown")
        await expect(
          page
            .getByRole("status")
            .filter({ hasText: "The request outcome could not be confirmed." }),
        ).toBeVisible();
      else if (outcome !== "session")
        await expect(page.locator("#mfa-disable-error")).toBeVisible();
    }
    expect(f.posts).toHaveLength(1);
    expect(f.posts[0]).toEqual({
      expectedFactorId: f.factorId,
      code: "123456",
    });
  });
}
test("lost network response reconciles current absence without claiming original success", async ({
  page,
}) => {
  const f = new Issue408MfaFixture();
  await openSecurity(page, f);
  await page.route("**" + disablePath, async (route) => {
    if (route.request().method() === "POST") {
      f.posts.push(route.request().postDataJSON());
      f.commit();
      await route.abort("failed");
    } else await route.fallback();
  });
  const dialog = await openDisable(page);
  await dialog.getByLabel("6-digit authenticator code").fill("123456");
  await dialog.getByRole("button", { name: "Confirm and disable MFA" }).click();
  await expect(
    page.getByRole("button", { name: "Set up authenticator" }),
  ).toBeVisible();
  await expect(
    page.getByText("The request outcome could not be confirmed.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "MFA is not enabled. You can set up an authenticator again.",
      { exact: true },
    ),
  ).toHaveCount(0);
  expect(f.posts).toHaveLength(1);
});
