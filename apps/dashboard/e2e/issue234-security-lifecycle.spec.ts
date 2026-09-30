import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  E2E_IDS,
} from "./support/dashboard-api-fixture";

const statePath = "/v1/staff/auth/mfa/state";
const beginPath = "/v1/staff/auth/mfa/enrollment/begin";
const reissuePath = "/v1/staff/auth/mfa/recovery-codes/reissue";

async function signInSecurity(page: Page) {
  await page.goto("/security");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("fixture-password");
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("failed authoritative reconciliation removes previously Verified Security state", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    mfaState: "ASSURED",
    override: (path, _request, state) => {
      if (path === reissuePath) {
        return {
          status: 503,
          body: {
            code: "MFA_UNAVAILABLE",
            message: "unavailable",
            requestId: "issue234-reissue-unknown",
          },
        };
      }
      if (path === statePath && state.count(statePath) > 1) {
        return {
          status: 503,
          body: {
            code: "MFA_UNAVAILABLE",
            message: "unavailable",
            requestId: "issue234-state-unavailable",
          },
        };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await signInSecurity(page);
  await expect(page.getByRole("status")).toContainText("Verified");

  await page.getByRole("button", { name: "Replace recovery codes" }).click();
  await page.getByLabel("6-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Replace recovery codes" }).click();

  await expect(page.getByRole("status")).toContainText("Account security unavailable");
  await expect(page.getByText("Verified", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("6-digit authenticator code")).toHaveCount(0);
  expect(fixture.count(reissuePath)).toBe(1);
  expect(fixture.count(statePath)).toBe(2);
});

test("late enrollment secret cannot publish after Security route exit", async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const secret = "ISSUE234ROUTEEXITSECRET23456789";
  const fixture = new DashboardApiFixture({
    mfaState: "ENROLLMENT_REQUIRED",
    override: async (path) => {
      if (path !== beginPath) return undefined;
      await pending;
      return {
        body: {
          factorId: E2E_IDS.factor,
          provisioning: {
            algorithm: "SHA1",
            digits: 6,
            issuer: "VAYLET",
            periodSeconds: 30,
            secretBase32: secret,
          },
        },
      };
    },
  });
  await fixture.install(page);
  await signInSecurity(page);
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  await expect.poll(() => fixture.count(beginPath)).toBe(1);

  await page.getByRole("button", { name: "Change scope" }).click();
  await expect(page.getByRole("heading", { name: "Choose your authorized workspace" })).toBeVisible();
  release();
  await expect(page.getByText(secret, { exact: false })).toHaveCount(0);
  expect(fixture.count(beginPath)).toBe(1);
});

test("late recovery-code disclosure cannot publish after logout", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const rawCode = "vmr1-issue234late-recovery-code-sentinel";
  const fixture = new DashboardApiFixture({
    mfaState: "ASSURED",
    override: async (path) => {
      if (path !== reissuePath) return undefined;
      await pending;
      return { body: { factorId: E2E_IDS.factor, recoveryCodes: [rawCode] } };
    },
  });
  await fixture.install(page);
  await signInSecurity(page);
  await page.getByRole("button", { name: "Replace recovery codes" }).click();
  await page.getByLabel("6-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Replace recovery codes" }).click();
  await expect.poll(() => fixture.count(reissuePath)).toBe(1);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  release();
  await expect(page.getByText(rawCode, { exact: false })).toHaveCount(0);
  expect(fixture.count(reissuePath)).toBe(1);
});

test("late MFA state success cannot restore Verified after logout", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fixture = new DashboardApiFixture({
    override: async (path) => {
      if (path !== statePath) return undefined;
      await pending;
      return { body: { state: "ASSURED" } };
    },
  });
  await fixture.install(page);
  await signInSecurity(page);
  await expect.poll(() => fixture.count(statePath)).toBeGreaterThanOrEqual(1);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  release();
  await expect(page.getByText("Verified", { exact: true })).toHaveCount(0);
});

test("cached ASSURED does not resume a fresh Management MFA denial", async ({ page }) => {
  let releaseFresh!: () => void;
  const freshPending = new Promise<void>((resolve) => { releaseFresh = resolve; });
  const discoveryPath = "/v1/staff/management/organizations";
  const fixture = new DashboardApiFixture({
    mfaState: "ASSURED",
    override: async (path, _request, current) => {
      if (path === statePath) {
        if (current.count(statePath) === 1) return { body: { state: "ASSURED" } };
        await freshPending;
        return { body: { state: "STEP_UP_REQUIRED" } };
      }
      if (path === discoveryPath) {
        return {
          status: 403,
          body: {
            code: "MFA_STEP_UP_REQUIRED",
            message: "Additional authentication is required.",
            requestId: "issue234-fresh-mfa-denial",
          },
        };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("fixture-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect.poll(() => fixture.count(discoveryPath)).toBe(1);
  await expect.poll(() => fixture.count(statePath)).toBe(2);
  expect(fixture.count(discoveryPath)).toBe(1);
  await expect(page.getByLabel("6-digit authenticator code")).toHaveCount(0);

  releaseFresh();
  await expect(page.getByLabel("6-digit authenticator code")).toBeVisible();
  expect(fixture.count(discoveryPath)).toBe(1);
});

test("same-identity external refresh restarts an obsolete pending MFA state read", async ({
  page,
}) => {
  let releaseOldState!: () => void;
  const oldStatePending = new Promise<void>((resolve) => { releaseOldState = resolve; });
  const discoveryPath = "/v1/staff/management/organizations";
  let stateAttempt = 0;
  let discoveryAttempt = 0;
  const fixture = new DashboardApiFixture({
    override: async (path) => {
      if (path === statePath) {
        stateAttempt += 1;
        if (stateAttempt === 1) {
          await oldStatePending;
          return { body: { state: "ASSURED" } };
        }
        return { body: { state: "ASSURED" } };
      }
      if (path === discoveryPath) {
        discoveryAttempt += 1;
        if (discoveryAttempt === 1) {
          return {
            status: 401,
            body: {
              code: "STAFF_AUTHENTICATION_FAILED",
              message: "expired",
              requestId: "issue234-external-refresh",
            },
          };
        }
        return { body: { items: [], nextCursor: null } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("fixture-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect.poll(() => fixture.count(statePath)).toBeGreaterThanOrEqual(1);
  await expect.poll(() => fixture.count(discoveryPath)).toBeGreaterThanOrEqual(2);
  // Cold bootstrap refresh + the unrelated Management GET reconciliation.
  await expect.poll(() => fixture.count("/v1/staff/auth/refresh")).toBe(2);
  await expect.poll(() => fixture.count(statePath)).toBe(2);
  await expect(page.getByRole("link", { name: "Security" })).toBeVisible();

  releaseOldState();
  expect(fixture.count(statePath)).toBe(2);
  // ScopeEntry already re-runs discovery when its auth generation changes; #234
  // only requires that the obsolete account-security read is fenced and replaced.
  expect(fixture.count(discoveryPath)).toBeLessThanOrEqual(3);
});

for (const staleReply of [
  { name: "success", reply: { body: { state: "ENROLLMENT_REQUIRED" } } },
  {
    name: "error",
    reply: {
      status: 503,
      body: {
        code: "MFA_SECURITY_UNAVAILABLE",
        message: "unavailable",
        requestId: "issue234-old-session-error",
      },
    },
  },
] as const) {
  test(`replacement session fences late old-session ${staleReply.name}`, async ({ page }) => {
    let releaseOld!: () => void;
    let releaseNew!: () => void;
    const oldPending = new Promise<void>((resolve) => { releaseOld = resolve; });
    const newPending = new Promise<void>((resolve) => { releaseNew = resolve; });
    let stateAttempt = 0;
    const fixture = new DashboardApiFixture({
      override: async (path) => {
        if (path !== statePath) return undefined;
        stateAttempt += 1;
        if (stateAttempt === 1) {
          await oldPending;
          return staleReply.reply;
        }
        await newPending;
        return { body: { state: "ASSURED" } };
      },
    });
    await fixture.install(page);
    await signInSecurity(page);
    await expect.poll(() => fixture.count(statePath)).toBe(1);

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByLabel("Email").fill("replacement@example.com");
    await page.getByLabel("Password").fill("fixture-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("status")).toContainText("Checking server status");
    await expect.poll(() => fixture.count(statePath)).toBe(2);

    releaseOld();
    await expect(page.getByRole("status")).toContainText("Checking server status");
    await expect(page.getByRole("button", { name: "Set up authenticator" })).toHaveCount(0);
    await expect(page.getByText("Account security unavailable", { exact: true })).toHaveCount(0);

    releaseNew();
    await expect(page.getByRole("status")).toContainText("Verified");
  });
}
