import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
  ORG_B,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  browserSecretPresent,
  deferred,
  fillCreate,
  inviteResult,
  openEmployees,
  STAFF_BASE,
  switchOrganization,
} from "./support/issue240d-onboarding";

test.use({ trace: "off" });
for (const outcome of ["success", "failure", "mfa"] as const) {
  test(`Organization A→B→A fences old Create ${outcome} and raw link`, async ({
    page,
  }) => {
    const started = deferred(),
      release = deferred(),
      completed = deferred();
    let posts = 0;
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A, ORG_B],
      companyLocations: {
        [ORG_A.organizationId]: [LOCATION_A],
        [ORG_B.organizationId]: [LOCATION_B],
      },
      override: async (path, request) => {
        if (path === STAFF_BASE && request.method() === "POST") {
          posts++;
          started.resolve();
          await release.promise;
          completed.resolve();
          return outcome === "success"
            ? { status: 201, body: inviteResult() }
            : {
                status: outcome === "mfa" ? 403 : 409,
                body: {
                  code:
                    outcome === "mfa"
                      ? "MFA_STEP_UP_REQUIRED"
                      : "STAFF_ONBOARDING_UNAVAILABLE",
                  message: "Old intent",
                  requestId: "old-create",
                },
              };
        }
        if (path.endsWith("/staff"))
          return { body: { items: [], nextCursor: null } };
        return undefined;
      },
    });
    await openEmployees(page, fixture);
    await page
      .getByRole("button", { name: "Create Employee", exact: true })
      .click();
    await (
      await fillCreate(page)
    )
      .getByRole("button", { name: "Create Employee", exact: true })
      .click();
    await started.promise;
    await switchOrganization(page, ORG_B, LOCATION_B);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await switchOrganization(page, ORG_A, LOCATION_A);
    await page
      .getByRole("button", { name: "Create Employee", exact: true })
      .click();
    const current = await fillCreate(page);
    await current.getByLabel("First name").fill("Current A");
    const reads = fixture.count(STAFF_BASE);
    release.resolve();
    await completed.promise;
    await page.waitForTimeout(150);
    await expect(current.getByLabel("First name")).toHaveValue("Current A");
    await expect(
      current.getByRole("button", { name: "Create Employee", exact: true }),
    ).toBeEnabled();
    await expect(current.getByRole("alert")).toHaveCount(0);
    await expect(page.getByText("Invite link generated")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(1);
    expect(posts).toBe(1);
    expect(fixture.count(STAFF_BASE)).toBe(reads);
    expect(await browserSecretPresent(page)).toBe(false);
  });
}

for (const replacement of [false, true]) {
  test(`logout ${replacement ? "and identity replacement" : "during Create"} discards late link`, async ({
    page,
  }) => {
    const started = deferred(),
      release = deferred();
    let posts = 0;
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: async (path, request) => {
        if (path === STAFF_BASE && request.method() === "POST") {
          posts++;
          started.resolve();
          await release.promise;
          return { status: 201, body: inviteResult() };
        }
        if (path === STAFF_BASE)
          return { body: { items: [], nextCursor: null } };
        return undefined;
      },
    });
    await openEmployees(page, fixture);
    await page
      .getByRole("button", { name: "Create Employee", exact: true })
      .click();
    await (
      await fillCreate(page)
    )
      .getByRole("button", { name: "Create Employee", exact: true })
      .click();
    await started.promise;
    await page
      .getByRole("button", { name: "Sign out" })
      .evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    if (replacement) {
      await signInOnCurrentPage(page, "replacement@example.com");
      await page.getByRole("button", { name: ORG_A.name }).click();
      await page.getByRole("button", { name: LOCATION_A.name }).click();
      await page
        .getByRole("button", { name: "Create Employee", exact: true })
        .click();
    }
    release.resolve();
    await page.waitForTimeout(150);
    await expect(page.getByText("Invite link generated")).toHaveCount(0);
    expect(posts).toBe(1);
    expect(await browserSecretPresent(page)).toBe(false);
  });
}

test("MFA callback after scope switch cannot restore or submit old Create", async ({
  page,
}) => {
  const started = deferred(),
    release = deferred();
  let posts = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A, ORG_B],
    companyLocations: {
      [ORG_A.organizationId]: [LOCATION_A],
      [ORG_B.organizationId]: [LOCATION_B],
    },
    override: async (path, request) => {
      if (path === STAFF_BASE && request.method() === "POST") {
        posts++;
        return {
          status: 403,
          body: {
            code: "MFA_STEP_UP_REQUIRED",
            message: "Verify",
            requestId: "240d-mfa",
          },
        };
      }
      if (path.endsWith("/staff"))
        return { body: { items: [], nextCursor: null } };
      if (path === "/v1/staff/auth/mfa/step-up") {
        started.resolve();
        await release.promise;
        return { body: { state: "ASSURED" } };
      }
      return undefined;
    },
  });
  await openEmployees(page, fixture);
  await page
    .getByRole("button", { name: "Create Employee", exact: true })
    .click();
  await (
    await fillCreate(page)
  )
    .getByRole("button", { name: "Create Employee", exact: true })
    .click();
  const mfa = page.getByRole("dialog", { name: "Verification required" });
  await mfa.getByLabel("6-digit authenticator code").fill("123456");
  await mfa.getByRole("button", { name: "Verify", exact: true }).click();
  await started.promise;
  await switchOrganization(page, ORG_B, LOCATION_B);
  await switchOrganization(page, ORG_A, LOCATION_A);
  await page
    .getByRole("button", { name: "Create Employee", exact: true })
    .click();
  release.resolve();
  await page.waitForTimeout(150);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByLabel("First name")).toHaveValue("");
  expect(posts).toBe(1);
});
