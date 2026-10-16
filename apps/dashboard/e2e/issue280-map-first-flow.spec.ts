import { expect, test, type Page } from "@playwright/test";
import {
  PresenceFixture, fillZone, attendanceZone, lmBase,
} from "./support/presence-fixtures";
import { mockIssue280Map } from "./issue280-map-first-map-mock";

const view = (page: Page, name: string) =>
  page.getByTestId(`presence-view-${name}`);
const stepper = (page: Page) => page.getByTestId("presence-setup-steps");
const field = (page: Page, name: string) =>
  page.locator(`[data-presence-field="${name}"]`);
const controlled = (code: string, status = 409) => ({
  status,
  body: { code, message: "fixture", requestId: "issue280-fixture" },
});

test("four setup steps are explicit navigation, not implied persistence", async ({
  page,
}) => {
  await mockIssue280Map(page);
  const fixture = new PresenceFixture("LM");
  await fixture.open(page);
  await expect(
    page.getByTestId("shift-presence-map-first-layout"),
  ).toHaveAttribute("data-active-view", "overview");
  await expect(page.getByTestId("presence-zones")).toContainText("Hotel lobby");
  await view(page, "setup").click();
  await expect(stepper(page)).toBeVisible();
  await expect(stepper(page).getByRole("navigation").getByRole("button")).toHaveCount(4);
  for (const [number, name] of [
    [1, "Scope"], [2, "Zones"], [3, "Policy"], [4, "Review"],
  ] as const) {
    const button = stepper(page).getByRole("button", {
      name: `Step ${number}: ${name}`, exact: true,
    });
    await button.click();
    await expect(button).toHaveAttribute("aria-current", "step");
    await expect(stepper(page)).toContainText(
      "Changing steps does not save zones or policy.",
    );
    expect(fixture.writes).toEqual([]);
  }
  await expect(stepper(page).getByRole("button", { name: "Next" })).toBeDisabled();
  await view(page, "overview").click();
  await expect(page.getByTestId("shift-presence-map-first-layout"))
    .toHaveAttribute("data-active-view", "overview");
  expect(fixture.writes).toEqual([]);
});

test("persisted zone precedes independent strict Start policy confirmation", async ({
  page,
}) => {
  await mockIssue280Map(page);
  const fixture = new PresenceFixture("LM");
  fixture.zones = [];
  fixture.policy.readiness = {
    ...fixture.policy.readiness,
    activeZoneCount: 0,
    configurationUsable: false,
    blockers: ["NO_USABLE_ATTENDANCE_ZONE"],
  };
  await fixture.open(page);
  await view(page, "zones").click();
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  const dialog = await fillZone(page);
  // Code is an editable suggestion, not an enforced derivative of Label.
  await dialog.getByLabel("Code", { exact: true }).fill("CUSTOM_GATE");
  await dialog.getByLabel("Label", { exact: true }).fill("Revised entrance");
  await expect(dialog.getByLabel("Code", { exact: true }))
    .toHaveValue("CUSTOM_GATE");
  expect(fixture.writes).toHaveLength(0);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0]!.path).toBe(`${lmBase}/zones`);
  expect(fixture.writes[0]!.body).toMatchObject({
    radiusMeters: 35.5, state: "ACTIVE", latitude: 0, longitude: 0,
    code: "CUSTOM_GATE", label: "Revised entrance",
  });
  const zoneId = fixture.writes[0]!.body.zoneId;
  expect(zoneId).toMatch(/^[0-9a-f-]{36}$/u);

  await view(page, "policy").click();
  const start = field(page, "shiftStartPresenceMode");
  const end = field(page, "shiftEndPresenceMode");
  await start.getByTestId("presence-inheritance-shiftStartPresenceMode").selectOption("CUSTOM");
  await start.getByRole("combobox").last().selectOption("REQUIRE");
  expect(fixture.writes).toHaveLength(1);
  await expect(end.getByRole("combobox").last()).toHaveValue("OFF");
  await start.getByRole("button", { name: "Save", exact: true }).click();
  await expect(start.getByRole("group", { name: /confirm/i })).toBeVisible();
  expect(fixture.writes).toHaveLength(1);
  await start.getByRole("group", { name: /confirm/i })
    .getByRole("button", { name: /confirm/i }).click();
  await expect.poll(() => fixture.writes.length).toBe(2);
  expect(fixture.writes[1]!.path).toBe(`${lmBase}/policy/override`);
  expect(fixture.writes[1]!.body).toMatchObject({
    field: "shiftStartPresenceMode", value: "REQUIRE",
    expectedRevision: 1, expectedCompanyRevision: 1,
  });
  expect(fixture.writes[1]!.body.mutationId).not.toBe(
    fixture.writes[0]!.body.mutationId,
  );
  expect(fixture.policy.effective.endMode).toBe("OFF");
});

test("CAS conflict retains the unsaved field and requires explicit rebase", async ({
  page,
}) => {
  let once = true;
  const fixture = new PresenceFixture("LM", (path, request, state) => {
    if (once && path.endsWith("/policy/override") && request.method() === "PUT") {
      once = false;
      state.policy.overrides.revision = 2;
      state.policy.overrides.maxAccuracyMetersOverride = 60;
      state.policy.effective.maxAccuracyMeters = 60;
      state.policy.readiness = {
        ...state.policy.readiness, locationRevision: 2,
        configurationFingerprint: "c".repeat(64),
      };
      return controlled("PRESENCE_REVISION_CONFLICT");
    }
    return undefined;
  });
  await fixture.open(page);
  await view(page, "policy").click();
  await page.getByTestId("shift-presence-policy")
    .locator("details > summary").click();
  const row = field(page, "shiftPresenceMaxAccuracyMeters");
  await row.getByTestId("presence-inheritance-shiftPresenceMaxAccuracyMeters").selectOption("CUSTOM");
  await row.getByRole("textbox").fill("70");
  await row.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row).toContainText("Previous saved value: 50");
  await expect(row).toContainText("Current server value: 60");
  await expect(row.getByRole("textbox")).toHaveValue("70");
  await expect(row.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  expect(fixture.writes).toHaveLength(1);
  await row.getByRole("button", { name: "Review current state and reapply draft" })
    .click();
  await row.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => fixture.writes.length).toBe(2);
  expect(fixture.writes[1]!.body).toMatchObject({
    expectedRevision: 2, value: 70,
    configurationFingerprint: "c".repeat(64),
  });
  expect(fixture.writes[1]!.body.mutationId).not.toBe(
    fixture.writes[0]!.body.mutationId,
  );
});

test("UNKNOWN zone outcome holds original mutation ID across workspace navigation", async ({
  page,
}) => {
  let id = "";
  let zoneId = "";
  let committed = false;
  const fixture = new PresenceFixture("LM", (path, request, state) => {
    if (path === `${lmBase}/zones` && request.method() === "POST") {
      const body = request.postDataJSON();
      id = body.mutationId;
      zoneId = body.zoneId;
      state.zones = [{ ...attendanceZone(), id: zoneId, label: body.label }];
      return controlled("SERVER_ERROR", 503);
    }
    if (path.includes("/results/")) {
      expect(path).toBe(`${lmBase}/results/${id}`);
      return {
        body: {
          mutationId: id, attribution: committed ? "COMMITTED" : "UNKNOWN",
          effect: committed ? "CHANGED" : null,
          entityId: committed ? zoneId : null,
          revision: committed ? 1 : null,
          canonical: {
            kind: "ZONE",
            value: { zone: state.zones[0], readiness: state.policy.readiness },
          },
        },
      };
    }
    return undefined;
  });
  await fixture.open(page);
  await view(page, "zones").click();
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  const dialog = await fillZone(page);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toContainText("outcome of your request is unknown");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await view(page, "setup").click();
  await view(page, "zones").click();
  await expect(
    page.getByRole("button", { name: "Add zone", exact: true }),
  ).toBeDisabled();
  expect(fixture.writes).toHaveLength(1);
  committed = true;
  await page.getByRole("button", { name: "Retry reconciliation" }).click();
  await expect(
    page.getByRole("button", { name: "Add zone", exact: true }),
  ).toBeEnabled();
  expect(fixture.writes).toHaveLength(1);
  expect(id).toMatch(/^[0-9a-f-]{36}$/u);
});

test("OFF/OFF remains valid without any configured attendance zone", async ({
  page,
}) => {
  const fixture = new PresenceFixture("LM");
  fixture.zones = [];
  fixture.policy.readiness = {
    ...fixture.policy.readiness,
    activeZoneCount: 0,
    configurationUsable: false,
    applicability: "NOT_APPLICABLE",
    blockers: ["NO_USABLE_ATTENDANCE_ZONE"],
  };
  await fixture.open(page);
  await view(page, "setup").click();
  await expect(stepper(page)).toBeVisible();
  await expect(stepper(page).getByRole("button", {
    name: "Step 1: Scope",
  })).toHaveAttribute("aria-current", "step");
  await stepper(page).getByRole("button", { name: "Step 3: Policy" }).click();
  await expect(field(page, "shiftStartPresenceMode").getByRole("combobox").last())
    .toHaveValue("OFF");
  await expect(field(page, "shiftEndPresenceMode").getByRole("combobox").last())
    .toHaveValue("OFF");
  expect(fixture.writes).toEqual([]);
  await stepper(page).getByRole("button", { name: "Step 4: Review" }).click();
  expect(fixture.writes).toEqual([]);
});

test("mixed per-field inheritance is preserved after one explicit override", async ({
  page,
}) => {
  const fixture = new PresenceFixture("LM");
  await fixture.open(page);
  await view(page, "policy").click();
  const start = field(page, "shiftStartPresenceMode");
  const end = field(page, "shiftEndPresenceMode");
  await expect(start).toContainText("Inherited");
  await expect(end).toContainText("Inherited");
  await start.getByTestId("presence-inheritance-shiftStartPresenceMode").selectOption("CUSTOM");
  await start.getByRole("combobox").last().selectOption("WARN_ONLY");
  await expect(end.getByRole("combobox").last()).toHaveValue("OFF");
  expect(fixture.writes).toEqual([]);
  await start.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  expect(fixture.writes[0]!.body).toMatchObject({
    field: "shiftStartPresenceMode", value: "WARN_ONLY",
    expectedCompanyRevision: 1, expectedRevision: 1,
  });
  await expect(start).toContainText("Overridden");
  await expect(end).toContainText("Inherited");
  expect(fixture.policy.overrides.startModeOverride).toBe("WARN_ONLY");
  expect(fixture.policy.overrides.endModeOverride).toBeNull();
  expect(fixture.policy.overrides.maxAccuracyMetersOverride).toBeNull();
  expect(fixture.policy.overrides.maxFixAgeSecondsOverride).toBeNull();
});
