import { expect, test } from "@playwright/test";
import { enterR08, r08Fixture, r08Path } from "./support/r08-accountability";
import { OP_IDS } from "./support/operations-fixtures";
import { E2E_IDS } from "./support/dashboard-api-fixture";
import { MALICIOUS_SETTING } from "./support/md04-fixtures";

test("Keys keep four status/occupancy combinations truthful with IDs only in Details", async ({
  page,
}) => {
  await enterR08(page, "/keys");
  const rows = page.locator("tbody tr");
  for (const [index, status, usage] of [
    [0, "Active", "Empty"],
    [1, "Active", "In use"],
    [2, "Inactive", "Empty"],
    [3, "Inactive", "In use"],
  ] as const) {
    await expect(
      rows.nth(index).getByText(status, { exact: true }),
    ).toBeVisible();
    await expect(
      rows.nth(index).getByText(usage, { exact: true }),
    ).toBeVisible();
  }
  await expect(page.getByRole("table")).not.toContainText(OP_IDS.session);
  await expect(page.getByRole("table")).not.toContainText(OP_IDS.keySlot);
  await page.getByRole("button", { name: "Details: Key Slot K-13" }).click();
  await expect(page.getByRole("dialog")).toContainText(OP_IDS.session);
  await expect(page.getByRole("button", { name: "Add Key" })).toHaveCount(0);
});

test("Incidents localize types/status/severity, humanize Location time and retain technical Details", async ({
  page,
}) => {
  await enterR08(page, "/incidents");
  const table = page.getByRole("table");
  for (const text of [
    "Vehicle damage",
    "Missing key",
    "Other incident type",
    "Open",
    "Investigating",
    "Low",
    "Medium",
    "High",
    "Critical",
  ]) {
    await expect(table.getByText(text, { exact: true }).first()).toBeVisible();
  }
  await expect(table).toContainText("2:00 PM");
  await expect(table).not.toContainText("2026-09-21T");
  await expect(table).not.toContainText(OP_IDS.session);
  await expect(table).not.toContainText("FUTURE_TYPE");
  await page
    .getByRole("button", { name: "Details: 4 — Other incident type" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("FUTURE_TYPE");
  await expect(page.getByRole("dialog")).toContainText(OP_IDS.session);
  await expect(
    page.getByRole("button", { name: /Report Incident|Claims/u }),
  ).toHaveCount(0);
});

test("Audit human labels preserve unknown minimal projection and escaped safe text", async ({
  page,
}) => {
  await enterR08(page, "/audit-log", r08Fixture(), true);
  const table = page.getByRole("table");
  await expect(table).toContainText("Staff member");
  await expect(table).toContainText("System");
  await expect(table).toContainText("Unknown event");
  await expect(table).not.toContainText(E2E_IDS.membership);
  await expect(table).not.toContainText("LOCATION_CONFIGURATION_OVERRIDE_SET");
  await expect(table).toContainText("UTC");
  await page
    .getByRole("button", {
      name: "Inspect event 3: Location configuration override set",
    })
    .click();
  await expect(page.getByRole("dialog")).toContainText(MALICIOUS_SETTING);
  await expect(page.getByRole("dialog").locator("img")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toContainText(E2E_IDS.membership);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Inspect event 4: Unknown event" })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "No safe details are available",
  );
  await expect(page.getByRole("dialog")).not.toContainText(E2E_IDS.membership);
});

for (const route of ["keys", "incidents"] as const) {
  test(`${route} empty is a successful bounded result`, async ({ page }) => {
    const fixture = r08Fixture((path) =>
      path === r08Path(route)
        ? { body: { items: [], nextCursor: null } }
        : undefined,
    );
    await fixture.install(page);
    // Enter populated first to reuse the normal workspace flow, then test empty via route navigation.
    await page.goto("/");
    const { signInOnCurrentPage } = await import("./support/foundation-ui");
    const { ORG_A, LOCATION_A } =
      await import("./support/dashboard-api-fixture");
    await signInOnCurrentPage(page);
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page.getByRole("button", { name: LOCATION_A.name }).click();
    await page
      .getByRole("navigation")
      .getByRole("link", {
        name: route === "keys" ? "Keys & Spots" : "Incidents",
        exact: true,
      })
      .click();
    await expect(
      page.getByText(
        route === "keys"
          ? "No current data is available."
          : "No current open or investigating incidents.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });
}

test("Incidents keep a long mixed-language description readable and inert", async ({
  page,
}, testInfo) => {
  const description =
    "Mirror inspection: فحص المرآة " +
    "Long-description-word ".repeat(30) +
    "<img src=x onerror=alert(1)>";
  const { incidentItem } = await import("./support/operations-fixtures");
  const fixture = r08Fixture((path) =>
    path === r08Path("incidents")
      ? {
          body: {
            items: [{ ...incidentItem(), description }],
            nextCursor: null,
          },
        }
      : undefined,
  );
  await page.setViewportSize({ width: 480, height: 900 });
  await enterR08(page, "/incidents", fixture);
  const cell = page.getByRole("cell", { name: description, exact: true });
  await expect(cell).toHaveCSS("overflow-wrap", "anywhere");
  await expect(cell).toHaveCSS("white-space", "pre-wrap");
  await expect(cell.locator("img")).toHaveCount(0);
  await page.locator("tbody tr").getByRole("button").click();
  await expect(page.getByRole("dialog")).toContainText(description);
  await expect(page.getByRole("dialog").locator("img")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    480,
  );
  await page.screenshot({
    path: testInfo.outputPath("long-incident-description.png"),
    fullPage: true,
  });
});
