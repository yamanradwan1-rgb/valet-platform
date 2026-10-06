import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signIn } from "./support/foundation-ui";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("delayed restoration cannot publish after definitive logout", async ({ page }) => {
  let restorationPhase = false;
  const started = deferred();
  const release = deferred();
  const organizationsPath = "/v1/staff/dashboard/organizations";
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: async (path) => {
      if (!restorationPhase || path !== organizationsPath) return undefined;
      started.resolve();
      await release.promise;
      return {
        status: 401,
        body: {
          code: "STAFF_AUTHENTICATION_REQUIRED",
          message: "expired",
          requestId: "issue268-delayed-logout",
        },
      };
    },
  });
  await fixture.install(page);
  await signIn(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await page.getByRole("link", { name: "Help" }).click();
  await expect(page).toHaveURL(/\/help$/u);
  restorationPhase = true;

  const reload = page.reload();
  await started.promise;
  await page.evaluate(async () => {
    await fetch("/v1/staff/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      credentials: "include",
    });
  });
  release.resolve();
  await reload;

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.locator(".topbar").getByText(LOCATION_A.name)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Help and product guidance" })).toHaveCount(0);
});
