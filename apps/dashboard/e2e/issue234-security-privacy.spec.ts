import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  E2E_IDS,
} from "./support/dashboard-api-fixture";
import {
  domHasSensitiveMatch,
  hasPersistentSensitiveMatch,
} from "./support/issue234-privacy";

const beginPath = "/v1/staff/auth/mfa/enrollment/begin";
const confirmPath = "/v1/staff/auth/mfa/enrollment/confirm";
const recoveryPath = "/v1/staff/auth/mfa/recovery/begin";
const reissuePath = "/v1/staff/auth/mfa/recovery-codes/reissue";
const setupSecret = "MFAPRIVACY".padEnd(32, "A");
const replacementSetupSecret = "MFARECOVERYPRIVACY".padEnd(32, "B");
const recoveryInput = `vmr1-${"i".repeat(11)}-${"j".repeat(27)}`;
const confirmedRecoveryCode = `vmr1-${"c".repeat(11)}-${"d".repeat(27)}`;
const reissuedRecoveryCode = `vmr1-${"u".repeat(11)}-${"v".repeat(27)}`;
const totpInput = "654321";
const reissueTotpInput = "135790";

function recoveryCodes(firstCode: string, filler: string) {
  return Array.from({ length: 10 }, (_, index) =>
    index === 0
      ? firstCode
      : `vmr1-${String(index).padStart(11, filler)}-${filler.repeat(27)}`,
  );
}

async function signInSecurity(page: Page, email = "admin@example.com") {
  await page.goto("/security");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("fixture-password");
  await page.getByRole("button", { name: "Sign in" }).click();
}

function captureBrowserLogs(page: Page) {
  const messages: string[] = [];
  page.on("console", (message) => messages.push(message.text()));
  page.on("pageerror", (error) => messages.push(error.message));
  return messages;
}

test("setup material, TOTP input, and raw recovery disclosure stay ephemeral", async ({
  page,
}) => {
  const logs = captureBrowserLogs(page);
  const fixture = new DashboardApiFixture({
    mfaState: "ENROLLMENT_REQUIRED",
    override: (path) => {
      if (path === beginPath) {
        return {
          body: {
            factorId: E2E_IDS.factor,
            provisioning: {
              algorithm: "SHA1",
              digits: 6,
              issuer: "VAYLET",
              periodSeconds: 30,
              secretBase32: setupSecret,
            },
          },
        };
      }
      if (path === confirmPath) {
        return {
          body: { recoveryCodes: recoveryCodes(confirmedRecoveryCode, "k") },
        };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await signInSecurity(page);
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  await expect(page.getByText(setupSecret, { exact: true })).toBeVisible();
  expect(await hasPersistentSensitiveMatch(page, [setupSecret])).toBe(false);

  await page.getByLabel("6-digit authenticator code").fill(totpInput);
  expect(await hasPersistentSensitiveMatch(page, [setupSecret, totpInput])).toBe(false);
  await page.getByRole("button", { name: "Confirm authenticator" }).click();
  await expect(page.getByText(confirmedRecoveryCode, { exact: true })).toBeVisible();
  expect(
    await hasPersistentSensitiveMatch(page, [
      setupSecret,
      totpInput,
      confirmedRecoveryCode,
    ]),
  ).toBe(false);

  await page.getByRole("button", { name: "I saved these codes" }).click();
  expect(
    await domHasSensitiveMatch(page, [setupSecret, confirmedRecoveryCode]),
  ).toBe(false);
  expect(
    await hasPersistentSensitiveMatch(page, [
      setupSecret,
      totpInput,
      confirmedRecoveryCode,
    ]),
  ).toBe(false);

  await page.getByRole("button", { name: "Change scope" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Security", level: 1 })).toBeVisible();
 expect(
   await domHasSensitiveMatch(page, [setupSecret, confirmedRecoveryCode]),
 ).toBe(false);
  expect(
    await hasPersistentSensitiveMatch(page, [
      setupSecret,
      totpInput,
      confirmedRecoveryCode,
    ]),
  ).toBe(false);

 const logSentinels = [
    setupSecret,
    totpInput,
    confirmedRecoveryCode,
    "vsa1.",
    "vaylet_e2e_refresh=fixture",
  ];
  expect(logs.some((message) => logSentinels.some((value) => message.includes(value)))).toBe(false);
});

test("recovery input and replacement setup material clear on route exit and logout", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    mfaState: "STEP_UP_REQUIRED",
    override: (path) =>
      path === recoveryPath
        ? {
            body: {
              factorId: E2E_IDS.factor,
              provisioning: {
                algorithm: "SHA1",
                digits: 6,
                issuer: "VAYLET",
                periodSeconds: 30,
                secretBase32: replacementSetupSecret,
              },
            },
          }
        : undefined,
  });
  await fixture.install(page);
  await signInSecurity(page);
  await page.getByLabel("Recovery code").fill(recoveryInput);
  expect(await hasPersistentSensitiveMatch(page, [recoveryInput])).toBe(false);
  await page.getByRole("button", { name: "Use recovery code" }).click();
  await expect(page.getByText(replacementSetupSecret, { exact: true })).toBeVisible();
  expect(
    await hasPersistentSensitiveMatch(page, [recoveryInput, replacementSetupSecret]),
  ).toBe(false);

  await page.getByRole("button", { name: "Change scope" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toBeVisible();
  expect(
    await domHasSensitiveMatch(page, [recoveryInput, replacementSetupSecret]),
  ).toBe(false);
  await page.goBack();
 expect(
   await domHasSensitiveMatch(page, [recoveryInput, replacementSetupSecret]),
 ).toBe(false);
  expect(
    await hasPersistentSensitiveMatch(page, [recoveryInput, replacementSetupSecret]),
  ).toBe(false);
 await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(
    await domHasSensitiveMatch(page, [recoveryInput, replacementSetupSecret]),
  ).toBe(false);
  expect(
    await hasPersistentSensitiveMatch(page, [recoveryInput, replacementSetupSecret]),
  ).toBe(false);
});

test("reissued recovery disclosure clears across dismissal and replacement session", async ({
  page,
}) => {
  const logs = captureBrowserLogs(page);
  const fixture = new DashboardApiFixture({
    mfaState: "ASSURED",
    override: (path) =>
      path === reissuePath
        ? {
            body: {
              factorId: E2E_IDS.factor,
              recoveryCodes: recoveryCodes(reissuedRecoveryCode, "z"),
            },
          }
        : undefined,
  });
  await fixture.install(page);
  await signInSecurity(page);

  await page.getByRole("button", { name: "Replace recovery codes" }).click();
  await page.getByLabel("6-digit authenticator code").fill(reissueTotpInput);
  expect(
    await hasPersistentSensitiveMatch(page, [reissueTotpInput, reissuedRecoveryCode]),
  ).toBe(false);
  await page.getByRole("button", { name: "Replace recovery codes" }).click();
  await expect(page.getByText(reissuedRecoveryCode, { exact: true })).toBeVisible();
  expect(
    await hasPersistentSensitiveMatch(page, [reissueTotpInput, reissuedRecoveryCode]),
  ).toBe(false);

  await page.getByRole("button", { name: "I saved these codes" }).click();
  expect(await domHasSensitiveMatch(page, [reissuedRecoveryCode])).toBe(false);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(await domHasSensitiveMatch(page, [reissuedRecoveryCode])).toBe(false);

  await page.getByLabel("Email").fill("replacement@example.com");
  await page.getByLabel("Password").fill("fixture-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("status")).toContainText("Verified");
  expect(await domHasSensitiveMatch(page, [reissuedRecoveryCode])).toBe(false);
  expect(
    await hasPersistentSensitiveMatch(page, [reissueTotpInput, reissuedRecoveryCode]),
  ).toBe(false);
  expect(
    logs.some((message) =>
      [reissueTotpInput, reissuedRecoveryCode].some((value) => message.includes(value)),
    ),
  ).toBe(false);
});
