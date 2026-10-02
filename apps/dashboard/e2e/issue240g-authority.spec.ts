import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  ORG_A,
  employeeContext,
  supervisorContext,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  forceFixture,
  FORCE_BASE,
  enterForceHistory,
  openForceEnd,
  fillForceEnd,
  forceResult,
  errorReply,
} from "./support/issue240g-force-end";
import { deferred } from "./support/staff-directory-ui";

for (const loss of ["grant", "entitlement", "role"] as const) {
  for (const outcome of ["success", "failure"] as const) {
    test(`${loss} loss destroys LM Force End intent before delayed ${outcome}`, async ({
      page,
    }) => {
      const started = deferred(),
        release = deferred();
      let revoked = false,
        lists = 0;
      const setup = forceFixture({
        manager: true,
        onPost: async (body) => {
          started.resolve();
          await release.promise;
          return outcome === "success"
            ? { body: forceResult(body) }
            : errorReply("OPEN_TASK_HANDOFF_REQUIRED");
        },
        onRead: (path) => {
          if (revoked && path === FORCE_BASE && ++lists === 1)
            return errorReply("STAFF_AUTHENTICATION_REQUIRED", 401);
          if (
            revoked &&
            path.includes("/dashboard/") &&
            path.endsWith("/subscription")
          )
            return errorReply(
              loss === "entitlement"
                ? "DASHBOARD_ACCESS_DENIED"
                : "AUTHORIZATION_DENIED",
              403,
            );
          return undefined;
        },
      });
      await setup.install(page);
      await enterForceHistory(page, true);
      await openForceEnd(page);
      const dialog = await fillForceEnd(page, "Revoked private reason");
      await dialog
        .getByRole("button", { name: "Force End Shift", exact: true })
        .click();
      await started.promise;
      revoked = true;
      await page
        .getByRole("button", { name: "Refresh", exact: true })
        .evaluate((button: HTMLButtonElement) => button.click());
      await expect
        .poll(() => setup.fixture.count("/v1/staff/auth/refresh"))
        .toBe(1);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      release.resolve();
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByText("maya@example.com", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByText("Revoked private reason", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Force End Shift", exact: true }),
      ).toHaveCount(0);
      expect(setup.posts).toHaveLength(1);
    });
  }
}

for (const role of ["supervisor", "employee"] as const) {
  test(`${role} has no Force End management surface on direct navigation`, async ({
    page,
  }) => {
    const fixture = new DashboardApiFixture({
      operationalContexts: [
        role === "supervisor" ? supervisorContext() : employeeContext(),
      ],
    });
    await fixture.install(page);
    await page.goto("/employees");
    await signInOnCurrentPage(page, `${role}@example.com`);
    const candidate = page.getByRole("button", {
      name: `${ORG_A.name} · Main Garage`,
    });
    if (await candidate.isVisible()) await candidate.click();
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", { name: "Employees & Shifts" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Force End Shift", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("maya@example.com", { exact: true }),
    ).toHaveCount(0);
    expect(
      [...fixture.counts.keys()].some((path) => path.includes("/shifts")),
    ).toBe(false);
  });
}
