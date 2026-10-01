import { expect, test } from "@playwright/test";
import {
  Issue236ZoneState,
  enterZoneFlow,
  zonePath,
} from "./support/issue236-parking-zones";

test("zero zones → create zone → create spot preserves draft, focus and bounded requests", async ({
  page,
}) => {
  const state = new Issue236ZoneState();
  const { spot } = await enterZoneFlow(page, state);
  await expect(
    spot.getByText(
      "No Parking Zones configured. Add a Parking Zone to continue.",
    ),
  ).toBeVisible();
  await spot.getByLabel("Code").fill("P-01");
  await spot.getByLabel("Label").fill("Front Row");
  await expect(
    spot.getByRole("button", { name: "Create", exact: true }),
  ).toBeDisabled();
  const add = spot.getByRole("button", { name: "Add Parking Zone" });
  await add.focus();
  await add.press("Enter");
  const zone = page.getByRole("dialog", { name: "Add Parking Zone" });
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(zone.getByLabel("Code")).toBeFocused();
  await zone.getByLabel("Code").fill(" Z:١ ");
  await zone.getByLabel("Label").fill(" منطقة أمامية ");
  await zone.getByRole("button", { name: "Create", exact: true }).dblclick();
  await expect(spot).toBeVisible();
  await expect(add).toBeFocused();
  await expect(spot.getByLabel("Code")).toHaveValue("P-01");
  await expect(spot.getByLabel("Label")).toHaveValue("Front Row");
  await expect(spot.getByLabel("Parking Zone")).toHaveValue(
    state.zones[0]!.parkingZoneId,
  );
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0]).toMatchObject({ code: "Z:١", label: "منطقة أمامية" });
  expect(state.reads).toEqual([null]);
  await spot.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Physical resource label" })
      .getByText("P-01", { exact: true }),
  ).toBeVisible();
  expect(state.resources.spotPostBodies).toHaveLength(1);
  expect(state.resources.spotPostBodies[0]).toMatchObject({
    parkingZoneId: state.zones[0]!.parkingZoneId,
  });
  const storage = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
  expect(storage).not.toMatch(/P-01|Z:١|منطقة|parkingZoneId|operationId/u);
});

test("101+ zones navigate explicit pages and retain returned selection outside the server page", async ({
  page,
}) => {
  const state = new Issue236ZoneState();
  for (let i = 1; i <= 105; i++)
    state.zones.push({
      parkingZoneId: `77777777-7777-4777-8777-${String(i).padStart(12, "0")}`,
      code: `Z${String(i).padStart(3, "0")}`,
      label: `Zone ${i}`,
      status: "ACTIVE",
    });
  const { spot } = await enterZoneFlow(page, state);
  expect(state.reads).toEqual([null]);
  await expect(spot.getByLabel("Parking Zone").locator("option")).toHaveCount(
    101,
  );
  await spot.getByRole("button", { name: "Next", exact: true }).click();
  await expect(spot.getByLabel("Parking Zone").locator("option")).toHaveCount(
    6,
  );
  await spot
    .getByLabel("Parking Zone")
    .selectOption(state.zones[104]!.parkingZoneId);
  await spot.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(spot.getByLabel("Parking Zone")).toHaveValue(
    state.zones[104]!.parkingZoneId,
  );
  expect(state.reads).toHaveLength(3);
  await spot.getByRole("button", { name: "Add Parking Zone" }).click();
  const zone = page.getByRole("dialog", { name: "Add Parking Zone" });
  await zone.getByLabel("Code").fill("ZZ-LAST");
  await zone.getByLabel("Label").fill("Last");
  await zone.getByRole("button", { name: "Create", exact: true }).click();
  await expect(spot.getByLabel("Parking Zone")).toHaveValue(
    state.zones.at(-1)!.parkingZoneId,
  );
  expect(state.reads).toHaveLength(3);
});

test("duplicate keeps zone draft; Escape returns to the preserved Spot with one focus trap", async ({
  page,
}) => {
  const state = new Issue236ZoneState();
  state.nextError = "RESOURCE_CODE_CONFLICT";
  const { spot } = await enterZoneFlow(page, state);
  await spot.getByLabel("Code").fill("DRAFT");
  await spot.getByRole("button", { name: "Add Parking Zone" }).click();
  const zone = page.getByRole("dialog", { name: "Add Parking Zone" });
  await zone.getByLabel("Code").fill("DUP");
  await zone.getByLabel("Label").fill("Keep");
  await zone.getByRole("button", { name: "Create", exact: true }).click();
  await expect(zone.getByRole("alert")).toContainText("Duplicate Zone code");
  await expect(zone.getByLabel("Code")).toHaveValue("DUP");
  await expect(zone.getByLabel("Label")).toHaveValue("Keep");
  await zone.press("Escape");
  await expect(spot.getByLabel("Code")).toHaveValue("DRAFT");
  await expect(
    spot.getByRole("button", { name: "Add Parking Zone" }),
  ).toBeFocused();
});

test("transport uncertainty reconciles once and explicit retry keeps the operation ID", async ({
  page,
}) => {
  const state = new Issue236ZoneState();
  const { spot } = await enterZoneFlow(page, state);
  let loseResponse = true;
  await page.route(`**${zonePath}`, async (route) => {
    if (route.request().method() === "POST" && loseResponse) {
      loseResponse = false;
      state.reply(zonePath, route.request());
      await route.abort("failed");
    } else await route.fallback();
  });
  await spot.getByRole("button", { name: "Add Parking Zone" }).click();
  const zone = page.getByRole("dialog", { name: "Add Parking Zone" });
  await zone.getByLabel("Code").fill("UNKNOWN");
  await zone.getByLabel("Label").fill("Unknown");
  await zone.getByRole("button", { name: "Create", exact: true }).click();
  await expect(zone.getByRole("alert")).toContainText("result is uncertain");
  expect(state.posts).toHaveLength(1);
  await expect.poll(() => state.reads.length).toBe(2);
  await zone.getByRole("button", { name: "Create", exact: true }).click();
  await expect(spot).toBeVisible();
  expect(state.posts).toHaveLength(2);
  expect(state.posts[0]!.operationId).toBe(state.posts[1]!.operationId);
  expect(state.zones).toHaveLength(1);
});
