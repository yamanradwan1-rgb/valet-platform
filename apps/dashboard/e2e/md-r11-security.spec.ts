import { expect, test } from "@playwright/test";
import { DashboardApiFixture } from "./support/dashboard-api-fixture";
import { persistentMatches } from "./support/persistent-storage";

for (const [state, label] of [
  ["ENROLLMENT_REQUIRED", "Setup required"],
  ["ENROLLMENT_PENDING", "Setup in progress"],
  ["STEP_UP_REQUIRED", "Verification required"],
  ["ASSURED", "Verified"],
] as const) {
  test(`R11 security presents ${state} without stale aborted-read errors`, async ({
    page,
  }) => {
    const fixture = new DashboardApiFixture({ mfaState: state });
    await fixture.install(page);
    await page.goto("/security");
    await page.getByLabel("Email").fill("admin@example.com");
    await page.getByLabel("Password").fill("fixture-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("status")).toContainText(label);
    await expect(
      page.getByText("The account security request could not be completed."),
    ).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCSS(
      "line-height",
      "32px",
    );
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    if (state === "ASSURED") {
      await page
        .getByRole("button", { name: "Replace recovery codes", exact: true })
        .click();
      await page.getByLabel("6-digit authenticator code").fill("123456");
      await page
        .getByRole("button", { name: "Replace recovery codes", exact: true })
        .click();
      await expect(page.locator("ol li")).toHaveCount(10);
      for (const code of await page.locator("ol li").allTextContents()) {
        expect(await persistentMatches(page, code)).toEqual({
          local: [],
          session: [],
          indexed: [],
          cache: [],
        });
      }
      expect(fixture.count("/v1/staff/auth/mfa/recovery-codes/reissue")).toBe(
        1,
      );
      await page.getByRole("button", { name: "I saved these codes" }).click();
      await expect(page.locator("ol li")).toHaveCount(0);
    }
  });
}

test("R11 security exposes checking then a truthful server error", async ({
  page,
}) => {
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fixture = new DashboardApiFixture({
    override: async (path) => {
      if (path !== "/v1/staff/auth/mfa/state") return undefined;
      await pending;
      return {
        status: 503,
        body: {
          code: "UNAVAILABLE",
          message: "Unavailable",
          requestId: "r11-safe-state",
        },
      };
    },
  });
  await fixture.install(page);
  await page.goto("/security");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("fixture-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Checking server status",
  );
  release!();
  await expect(
    page.getByRole("alert").filter({ hasText: /account security request/ }),
  ).toBeVisible();
  await expect(page.getByRole("status")).not.toContainText("Verified");
});
