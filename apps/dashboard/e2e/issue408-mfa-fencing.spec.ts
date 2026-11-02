import { expect, test } from "@playwright/test";
import {
  Issue408MfaFixture,
  disablePath,
  openDisable,
  openSecurity,
} from "./support/issue408-mfa-fixture";
const replacement = "00000000-0000-4000-8000-000000000408";

test("reload obtains a fresh factor precondition, never a stored factor or proof", async ({
  page,
}) => {
  const f = new Issue408MfaFixture();
  await openSecurity(page, f);
  const reads = f.count(disablePath);
  f.factorId = replacement;
  await page.reload();
  const dialog = await openDisable(page);
  await dialog.getByLabel("6-digit authenticator code").fill("654321");
  await dialog.getByRole("button", { name: "Confirm and disable MFA" }).click();
  await expect(
    page.getByRole("button", { name: "Set up authenticator" }),
  ).toBeVisible();
  expect(f.posts).toEqual([{ expectedFactorId: replacement, code: "654321" }]);
  expect(f.count(disablePath)).toBeGreaterThan(reads);
  const storage = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
      url: location.href,
    }),
  );
  expect(storage).not.toContain(replacement);
  expect(storage).not.toContain("654321");
});
test("cross-tab security change closes old confirmation and requires fresh explicit action", async ({
  page,
}) => {
  const f = new Issue408MfaFixture();
  await openSecurity(page, f);
  const dialog = await openDisable(page);
  await dialog.getByLabel("6-digit authenticator code").fill("123456");
  f.factorId = replacement;
  await page.evaluate(() => {
    const channel = new BroadcastChannel("vaylet-account-mfa");
    channel.postMessage("MFA_CHANGED");
    channel.close();
  });
  await expect(dialog).toHaveCount(0);
  expect(f.posts).toHaveLength(0);
  const next = await openDisable(page);
  await expect(next.getByLabel("6-digit authenticator code")).toHaveValue("");
});
test("actual Staff session replacement fences rejected mutation and clears proof", async ({
  page,
}) => {
  const f = new Issue408MfaFixture();
  await openSecurity(page, f);
  const dialog = await openDisable(page);
  f.auth.staffAuthSessionId = replacement;
  f.outcome = "session";
  await dialog.getByLabel("6-digit authenticator code").fill("123456");
  await dialog.getByRole("button", { name: "Confirm and disable MFA" }).click();
  await expect(dialog).toHaveCount(0);
  expect(f.posts).toHaveLength(1);
  f.outcome = "success";
  const next = await openDisable(page);
  await expect(next.getByLabel("6-digit authenticator code")).toHaveValue("");
  expect(f.posts).toHaveLength(1);
});
test("a changed availability precondition on opening cannot reuse the earlier intent", async ({
  page,
}) => {
  const f = new Issue408MfaFixture();
  await openSecurity(page, f);
  await expect(
    page.getByRole("button", { name: "Disable MFA", exact: true }),
  ).toBeVisible();
  f.factorId = replacement;
  await page.getByRole("button", { name: "Disable MFA", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Disable MFA" })).toHaveCount(
    0,
  );
  await expect(page.locator("#mfa-disable-error")).toContainText(
    "MFA state changed",
  );
  expect(f.posts).toHaveLength(0);
  await openDisable(page);
});
