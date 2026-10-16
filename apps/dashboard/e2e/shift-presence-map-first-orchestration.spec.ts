import { expect, test, type Page } from "@playwright/test";
import { PresenceFixture, fillZone } from "./support/presence-fixtures";
import { LOCATION_A, LOCATION_B } from "./support/fixture-data";

async function switchLocation(page: Page, name: string) {
  await page.locator(".topbar")
    .getByRole("button", { name: "Change scope", exact: true }).click();
  await page.getByRole("option", { name: new RegExp(name) }).click();
}

test("Company stays policy-only; Location opens map-first and setup is navigation-only", async ({ page }) => {
  const company = new PresenceFixture("CA");
  await company.open(page, true);
  await expect(page.getByTestId("shift-presence-map-first-layout")).toHaveCount(0);
  await expect(page.locator("[data-presence-field]")).toHaveCount(4);
  await expect(page.getByTestId("presence-zones")).toHaveCount(0);
  await page.getByRole("tab", { name: "Location Overrides" }).click();
  const layout = page.getByTestId("shift-presence-map-first-layout");
  await expect(layout).toHaveAttribute("data-active-view", "overview");
  await expect(layout.getByTestId("presence-zones")).toBeVisible();
  await expect(layout.getByTestId("presence-readiness")).toBeVisible();
  await layout.getByTestId("presence-view-setup").click();
  await expect(page.getByTestId("presence-setup-scope")).toContainText(LOCATION_A.name);
  await expect(page.getByTestId("presence-setup-scope")).toContainText("checked only at shift Start or End");
  for (const [number, label, testId] of [
    [2, "Zones", "presence-setup-zones"],
    [3, "Policy", "presence-setup-policy"],
    [4, "Review", "presence-setup-review"],
  ] as const) {
    await page.getByRole("button", { name: `Step ${number}: ${label}` }).click();
    await expect(page.getByTestId(testId)).toBeVisible();
  }
  expect(company.writes).toHaveLength(0);
});

test("unsaved independent policy drafts survive view changes and review never saves them", async ({ page }) => {
  const fixture = new PresenceFixture("LM");
  await fixture.open(page);
  await page.getByTestId("presence-view-policy").click();
  const start = page.locator('[data-presence-field="shiftStartPresenceMode"]');
  await start.getByTestId("presence-inheritance-shiftStartPresenceMode").selectOption("CUSTOM");
  await start.getByRole("combobox").last().selectOption("REQUIRE_OR_OVERRIDE");
  await page.getByTestId("presence-view-overview").click();
  await page.getByTestId("presence-view-setup").click();
  await page.getByRole("button", { name: "Step 4: Review" }).click();
  const review = page.getByTestId("presence-setup-review");
  await expect(review).toContainText("Fields awaiting apply: 1");
  await expect(review).toContainText("Not saved");
  await expect(review).toContainText("Require or override");
  expect(fixture.writes).toHaveLength(0);
  await page.getByTestId("presence-view-policy").click();
  await expect(start.getByRole("combobox").last()).toHaveValue("REQUIRE_OR_OVERRIDE");
  expect(fixture.policy.effective.startMode).toBe("OFF");
  await start.getByRole("button", { name: "Save", exact: true }).click();
  await start.getByRole("button", { name: "Confirm this strict change" }).click();
  await expect(start).toContainText("Overridden");
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0]!.body).toMatchObject({
    expectedRevision: 1,
    field: "shiftStartPresenceMode",
    value: "REQUIRE_OR_OVERRIDE",
  });
});

test("scope A→B→A retires all unsaved drafts and zone saves precede strict writes", async ({ page }) => {
  const fixture = new PresenceFixture("LM", (path, _request, state) => {
    if (!path.includes(LOCATION_B.locationId)) return undefined;
    if (path.endsWith("/policy"))
      return { body: { ...state.policy, locationId: LOCATION_B.locationId } };
    if (path.endsWith("/zones") || path.endsWith("/exceptions"))
      return { body: { items: [], nextCursor: null } };
    return undefined;
  });
  await fixture.open(page);
  await page.getByTestId("presence-view-policy").click();
  const end = page.locator('[data-presence-field="shiftEndPresenceMode"]');
  await end.getByTestId("presence-inheritance-shiftEndPresenceMode").selectOption("CUSTOM");
  await end.getByRole("combobox").last().selectOption("WARN_ONLY");
  await switchLocation(page, LOCATION_B.name);
  await switchLocation(page, LOCATION_A.name);
  await page.getByTestId("presence-view-policy").click();
  await expect(page.locator('[data-presence-field="shiftEndPresenceMode"]')
    .getByRole("combobox").last()).toHaveValue("OFF");
  await page.getByTestId("presence-view-zones").click();
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  const dialog = await fillZone(page);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByTestId("presence-view-policy").click();
  const start = page.locator('[data-presence-field="shiftStartPresenceMode"]');
  await start.getByTestId("presence-inheritance-shiftStartPresenceMode").selectOption("CUSTOM");
  await start.getByRole("combobox").last().selectOption("REQUIRE");
  await start.getByRole("button", { name: "Save", exact: true }).click();
  await start.getByRole("button", { name: "Confirm this strict change" }).click();
  expect(fixture.writes.map((entry) => entry.path)).toEqual([
    expect.stringMatching(/\/zones$/),
    expect.stringMatching(/\/policy\/override$/),
  ]);
});
