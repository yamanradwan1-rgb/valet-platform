import { expect, test, type Page } from "@playwright/test";
import { PresenceFixture, lmBase } from "./support/presence-fixtures";
import { LOCATION_A, LOCATION_B, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { installIssue407Map } from "./support/issue407-map-sdk";

const busy = {
  status: 409,
  body: {
    code: "PRESENCE_AUTHORITY_BUSY",
    message: "Public API conflict",
    requestId: "synthetic",
  },
};
async function open(page: Page, fixture: PresenceFixture, section = "zones") {
  await fixture.fixture.install(page);
  await page.goto(`/policies?section=${section}`);
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name, exact: true }).click();
  await page
    .getByRole("button", { name: LOCATION_A.name, exact: true })
    .click();
  await expect(page.locator(".ps-workspace")).toBeVisible();
}
async function foreground(page: Page) {
  await page.evaluate(() => dispatchEvent(new Event("focus")));
}

for (const locale of ["en", "ar"] as const) {
  for (const failedRead of ["policy", "zones"] as const) {
    test(`${locale}: temporary ${failedRead} 409 has Retry and restores authorized editing`, async ({
      page,
    }) => {
      let failing = true;
      const fixture = new PresenceFixture("LM", (path) =>
        failing && path === `${lmBase}/${failedRead}` ? busy : undefined,
      );
      await installIssue407Map(page);
      await open(page, fixture);
      await page.evaluate((value) => {
        localStorage.setItem("vaylet_dashboard_locale", value);
        dispatchEvent(new Event("vaylet-dashboard-locale-change"));
      }, locale);
      const message =
        locale === "en"
          ? "Attendance settings are temporarily busy. Please retry in a moment."
          : "إعدادات الحضور مشغولة مؤقتًا. يُرجى إعادة المحاولة بعد قليل.";
      await expect(
        page.locator(".ps-pane-body .ps-state[role=alert]"),
      ).toContainText(message);
      await expect(page.locator(".ps-scope-note")).not.toContainText(
        /View-only|للعرض فقط/,
      );
      await expect(page.locator(".ps-zone-form, .ps-edit-button")).toHaveCount(
        0,
      );
      const before = fixture.requests.length;
      failing = false;
      await page
        .getByRole("button", {
          name: locale === "en" ? "Retry" : "إعادة المحاولة",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("button", {
          name: locale === "en" ? "Add zone" : "إضافة منطقة",
          exact: true,
        }),
      ).toBeVisible();
      expect(fixture.requests.length - before).toBeLessThanOrEqual(4);
      expect(fixture.writes).toEqual([]);
      await expect(page.locator(".ps-zone-map")).toBeVisible();
      await expect(page.locator(".ps-offline-map")).toHaveCount(0);
    });
  }
}

test("a successful read-only capability retains the permission banner and blocks writes", async ({
  page,
}) => {
  const fixture = new PresenceFixture("LM");
  fixture.policy.capabilities.canEdit = false;
  await installIssue407Map(page);
  await open(page, fixture, "presence");
  await expect(page.locator(".ps-scope-note")).toContainText(
    "View-only for this scope or account",
  );
  await expect(page.locator(".ps-edit-button")).toHaveCount(0);
  expect(fixture.writes).toEqual([]);
});

test("a genuine authorization denial stays denied without temporary-busy copy or editing", async ({
  page,
}) => {
  const fixture = new PresenceFixture("LM", (path) =>
    path === `${lmBase}/policy`
      ? {
          status: 403,
          body: {
            code: "AUTHORIZATION_DENIED",
            message: "Denied",
            requestId: "synthetic",
          },
        }
      : undefined,
  );
  await open(page, fixture);
  await expect(
    page.locator(".ps-pane-body .ps-state[role=alert]"),
  ).toContainText("You do not have access to Policies & Settings.");
  await expect(page.locator(".ps-pane-body")).not.toContainText(
    "temporarily busy",
  );
  await expect(page.locator(".ps-zone-map, .ps-edit-button")).toHaveCount(0);
  expect(fixture.writes).toEqual([]);
});

test("a dirty policy draft survives a failed foreground read and Retry, with saves disabled", async ({
  page,
}) => {
  let failing = false;
  const fixture = new PresenceFixture("LM", (path) =>
    failing && path === `${lmBase}/policy` ? busy : undefined,
  );
  await open(page, fixture, "presence");
  const field = page.locator('[data-setting="shiftPresenceMaxAccuracyMeters"]');
  await field.locator(".ps-edit-button").click();
  await field.locator("input").fill("65");
  failing = true;
  await foreground(page);
  await expect(
    page.locator(".ps-pane-body .ps-state[role=alert]"),
  ).toContainText("temporarily busy");
  await expect(field.locator("input")).toHaveValue("65");
  await expect(
    field.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".ps-scope-note")).not.toContainText("View-only");
  failing = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(field.locator("input")).toHaveValue("65");
  await expect(
    field.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();
  expect(fixture.writes).toEqual([]);
});

test("a zone draft survives transient zone failure; delayed Location A data cannot populate B", async ({
  page,
}) => {
  let failing = false;
  let hold = false;
  let reached!: () => void;
  let release!: () => void;
  const atRead = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fixture = new PresenceFixture("LM", async (path, _request, state) => {
    if (path.includes(LOCATION_B.locationId)) {
      if (path.endsWith("/policy"))
        return { body: { ...state.policy, locationId: LOCATION_B.locationId } };
      if (path.endsWith("/zones"))
        return { body: { items: [], nextCursor: null } };
    }
    if (path === `${lmBase}/zones` && failing) return busy;
    if (path === `${lmBase}/policy` && hold) {
      reached();
      await barrier;
      return { body: state.policy };
    }
    return undefined;
  });
  await installIssue407Map(page);
  await open(page, fixture);
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  await page.getByLabel("Zone label", { exact: true }).fill("Retained draft");
  failing = true;
  await foreground(page);
  await expect(
    page.locator(".ps-pane-body .ps-state[role=alert]"),
  ).toContainText("temporarily busy");
  await expect(page.getByLabel("Zone label", { exact: true })).toHaveValue(
    "Retained draft",
  );
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  failing = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByLabel("Zone label", { exact: true })).toBeEnabled();
  hold = true;
  await foreground(page);
  await atRead;
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope", exact: true })
    .click();
  await page.getByRole("option", { name: new RegExp(LOCATION_B.name) }).click();
  await expect(page.locator(".ps-context-name")).toContainText(LOCATION_B.name);
  release();
  await expect(page.locator(".ps-zone-form")).toHaveCount(0);
  await expect(page.locator(".ps-zone-list")).not.toContainText("Hotel lobby");
  await expect(page.locator(".ps-pane-body")).not.toContainText(
    "Retained draft",
  );
  expect(fixture.writes).toEqual([]);
});
