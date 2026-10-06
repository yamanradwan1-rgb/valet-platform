import { expect, test } from "@playwright/test";
import {
  PresenceFixture,
  fillZone,
  companyBase,
  caBase,
  lmBase,
} from "./support/presence-fixtures";

test("Company has exactly four independent defaults and no Location workflow", async ({
  page,
}) => {
  const f = new PresenceFixture("CA");
  await f.open(page, true);
  const section = page.getByTestId("shift-presence");
  await expect(section.locator("[data-presence-field]")).toHaveCount(4);
  await expect(section.getByTestId("presence-readiness")).toHaveCount(0);
  await expect(section.getByTestId("presence-zones")).toHaveCount(0);
  await expect(section.getByTestId("presence-exceptions")).toHaveCount(0);
  const row = section.locator(
    '[data-presence-field="shiftPresenceMaxAccuracyMeters"]',
  );
  await row.getByRole("textbox").fill("51");
  await row.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row).toContainText("51");
  expect(f.writes).toHaveLength(1);
  expect(f.writes[0]!.path).toBe(`${companyBase}/policy/default`);
  expect(f.writes[0]!.body).toMatchObject({
    expectedRevision: 1,
    field: "shiftPresenceMaxAccuracyMeters",
    value: 51,
  });
  await expect(
    row.getByText("Another change occurred", { exact: false }),
  ).toHaveCount(0);
});

for (const authority of ["CA", "LM"] as const) {
  test(`${authority} Location has shared ordered composition and explicit inheritance`, async ({
    page,
  }) => {
    const f = new PresenceFixture(authority);
    await f.open(page);
    const section = page.getByTestId("shift-presence");
    await expect(section.locator("[data-presence-field]")).toHaveCount(4);
    const order = await section.locator("h2,h3").allTextContents();
    expect(order[0]).toBe("Shift Presence");
    expect(order[1]).toContain("Readiness");
    expect(order.slice(2)).toEqual(["Attendance Zones", "Presence Exceptions"]);
    const row = section.locator(
      '[data-presence-field="shiftStartPresenceMode"]',
    );
    await expect(row).toContainText("Inherited");
    // Deliberately selecting the inherited value creates an explicit override.
    await row.getByRole("combobox").selectOption("OFF");
    await row.getByRole("button", { name: "Save", exact: true }).click();
    await expect(row).toContainText("Overridden");
    await row.getByRole("button", { name: "Clear Override" }).click();
    await expect(row).toContainText("Inherited");
    expect(f.writes.map((w) => w.path)).toEqual([
      `${authority === "CA" ? caBase : lmBase}/policy/override`,
      `${authority === "CA" ? caBase : lmBase}/policy/override/clear`,
    ]);
    expect(f.writes[1]!.body).toMatchObject({
      expectedRevision: 2,
      expectedCompanyRevision: 1,
    });
    expect(f.writes[1]!.body).not.toHaveProperty("value");
    expect(
      f.requests.every(
        (url) =>
          !url.includes(authority === "CA" ? "/dashboard/" : "/management/"),
      ),
    ).toBe(true);
  });
}

test("manual zone saves decimal radius and zero center while map unavailable", async ({
  page,
}) => {
  await page.route("https://maps.googleapis.com/maps/api/js?**", (route) =>
    route.abort("failed"),
  );
  const f = new PresenceFixture();
  await f.open(page);
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  await expect(page.getByLabel("Label", { exact: true })).toBeFocused();
  const dialog = await fillZone(page);
  await expect(dialog).toContainText("Map unavailable");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(f.writes).toHaveLength(1);
  expect(f.writes[0]!.body).toMatchObject({
    latitude: 0,
    longitude: 0,
    radiusMeters: 35.5,
    state: "ACTIVE",
    label: "South entrance",
  });
  expect(f.writes[0]!.body.zoneId).toMatch(/^[0-9a-f-]{36}$/);
  expect(f.writes[0]!.body.mutationId).toMatch(/^[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { name: "Shift Presence", exact: true }),
  ).toBeFocused();
});

test("invalid numeric drafts do not dispatch; ready strict save persists", async ({
  page,
}) => {
  const f = new PresenceFixture("LM");
  await f.open(page);
  const accuracy = page.locator(
    '[data-presence-field="shiftPresenceMaxAccuracyMeters"]',
  );
  for (const value of ["", "0", "201", "1.5", "NaN", "Infinity"]) {
    await accuracy.getByRole("textbox").fill(value);
    await expect(
      accuracy.getByRole("button", { name: "Save", exact: true }),
    ).toBeDisabled();
  }
  expect(f.writes).toHaveLength(0);
  const row = page.locator('[data-presence-field="shiftStartPresenceMode"]');
  await row.getByRole("combobox").selectOption("REQUIRE");
  await row.getByRole("button", { name: "Save", exact: true }).click();
  expect(f.writes).toHaveLength(1);
  expect(f.policy.effective.startMode).toBe("REQUIRE");
  expect(f.policy.readiness).toMatchObject({
    applicability: "STRICT",
    configurationUsable: true,
    strictActivationAllowed: true,
    blockers: [],
  });
  await expect(row).toContainText("Overridden");
  await expect(page.getByTestId("shift-presence")).toContainText(
    "Readiness: Ready",
  );
});

test("strict save shows authoritative not-ready rejection", async ({
  page,
}) => {
  const f = new PresenceFixture("LM", (path, request) =>
    request.method() !== "GET" && path.includes("/policy/")
      ? {
          status: 409,
          body: {
            code: "PRESENCE_NOT_READY",
            message: "not ready",
            requestId: "fixture",
          },
        }
      : undefined,
  );
  await f.open(page);
  const row = page.locator('[data-presence-field="shiftStartPresenceMode"]');
  await row.getByRole("combobox").selectOption("REQUIRE");
  await row.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("shift-presence")).toContainText(
    "Server readiness blocks this configuration.",
  );
  expect(f.policy.effective.startMode).toBe("OFF");
});

test("safe exceptions have real identity; approval only changes exception history", async ({
  page,
}) => {
  const f = new PresenceFixture();
  await f.open(page);
  const section = page.getByTestId("presence-exceptions");
  await expect(section).toContainText("Nadia Salem");
  await expect(section).toContainText("nadia@example.com");
  await section.getByRole("button", { name: "Review", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Review Presence Exception",
  });
  await expect(dialog).toContainText(
    "Approval does not start or end the Shift",
  );
  await dialog.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await section.getByRole("button", { name: "History", exact: true }).click();
  await expect(section).toContainText("Approved");
  expect(f.writes).toHaveLength(1);
  expect(f.writes[0]!.path).toContain("/exceptions/");
  expect(f.requests.every((url) => !url.includes("/shifts/"))).toBe(true);
  const text = await page.getByTestId("shift-presence").innerText();
  expect(text).not.toContain("a".repeat(64));
  expect(text).not.toContain("bbbbbbbb");
});
