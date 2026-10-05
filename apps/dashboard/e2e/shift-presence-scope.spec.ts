import { expect, test, type Page } from "@playwright/test";
import {
  PresenceFixture,
  attendanceZone,
  fillZone,
  lmBase,
} from "./support/presence-fixtures";
import { LOCATION_A, LOCATION_B } from "./support/fixture-data";

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function changeLocation(page: Page, location = LOCATION_A) {
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope", exact: true })
    .click();
  await page.getByRole("option", { name: new RegExp(location.name) }).click();
}

test("Location A→B→A rejects the delayed first-A policy read", async ({
  page,
}) => {
  const pending = gate();
  const started = gate();
  let delay = false;
  const f = new PresenceFixture("LM", async (path, request, state) => {
    if (path.endsWith("/policy") && request.method() === "GET") {
      if (delay && path === `${lmBase}/policy`) {
        delay = false;
        const stale = structuredClone(state.policy);
        stale.effective.maxAccuracyMeters = 99;
        started.release();
        await pending.promise;
        return { body: stale };
      }
      return {
        body: {
          ...state.policy,
          locationId: path.includes(LOCATION_B.locationId)
            ? LOCATION_B.locationId
            : LOCATION_A.locationId,
        },
      };
    }
    if (path.includes(LOCATION_B.locationId) && path.endsWith("/zones"))
      return { body: { items: [], nextCursor: null } };
    if (path.includes(LOCATION_B.locationId) && path.endsWith("/exceptions"))
      return { body: { items: [], nextCursor: null } };
    return undefined;
  });
  await f.open(page);
  await expect(
    page.locator("#presence-shiftPresenceMaxAccuracyMeters"),
  ).toHaveValue("50");
  delay = true;
  await page
    .getByTestId("shift-presence")
    .getByRole("button", { name: "Refresh", exact: true })
    .first()
    .click();
  await started.promise;
  await changeLocation(page, LOCATION_B);
  await expect(
    page.locator("#presence-shiftPresenceMaxAccuracyMeters"),
  ).toHaveValue("50");
  await changeLocation(page);
  await expect(
    page.locator("#presence-shiftPresenceMaxAccuracyMeters"),
  ).toHaveValue("50");
  pending.release();
  await expect
    .poll(() => f.requests.filter((url) => url.endsWith("/policy")).length)
    .toBeGreaterThanOrEqual(4);
  await expect(
    page.locator("#presence-shiftPresenceMaxAccuracyMeters"),
  ).toHaveValue("50");
});

test("foreground exact-zone refresh retains draft and blocks writes until current policy", async ({
  page,
}) => {
  const pending = gate();
  const started = gate();
  let delay = false;
  const f = new PresenceFixture("LM", async (path) => {
    if (delay && path === `${lmBase}/policy`) {
      started.release();
      await pending.promise;
    }
    return undefined;
  });
  await f.open(page);
  await page
    .getByTestId("presence-zones")
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Latitude", { exact: true }).fill("30");
  f.zones[0]!.revision = 2;
  delay = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await started.promise;
  try {
    await expect(
      dialog.getByRole("button", { name: "Save", exact: true }),
    ).toBeDisabled();
    await expect(dialog).toContainText("Another change occurred.");
    await expect(dialog.getByLabel("Latitude", { exact: true })).toHaveValue(
      "30",
    );
    expect(f.writes).toHaveLength(0);
  } finally {
    pending.release();
  }
  await expect(
    dialog.getByRole("button", {
      name: "Review current state and reapply draft",
    }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Review current state and reapply draft" })
    .click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(f.writes[0]!.body).toMatchObject({
    expectedRevision: 2,
    latitude: 30,
  });
});

test("in-flight write survives A-B-A as UNKNOWN without resurrecting its stale callback", async ({
  page,
}) => {
  const pending = gate();
  const started = gate();
  let mutationId = "";
  let zoneId = "";
  const f = new PresenceFixture("LM", async (path, request, state) => {
    if (path === `${lmBase}/zones` && request.method() === "POST") {
      const body = request.postDataJSON();
      ({ mutationId, zoneId } = body);
      started.release();
      await pending.promise;
      return {
        body: {
          zone: {
            ...attendanceZone(),
            id: body.zoneId,
            label: "Retired success",
          },
          readiness: state.policy.readiness,
        },
      };
    }
    if (path.includes("/results/")) {
      expect(path).toBe(`${lmBase}/results/${mutationId}`);
      expect(new URL(request.url()).searchParams.get("entityId")).toBe(zoneId);
      return {
        body: {
          mutationId,
          attribution: "COMMITTED",
          effect: "CHANGED",
          entityId: zoneId,
          revision: 1,
          canonical: {
            kind: "ZONE",
            value: {
              zone: { ...attendanceZone(), id: zoneId },
              readiness: state.policy.readiness,
            },
          },
        },
      };
    }
    if (path.includes(LOCATION_B.locationId)) {
      if (path.endsWith("/policy"))
        return { body: { ...state.policy, locationId: LOCATION_B.locationId } };
      return { body: { items: [], nextCursor: null } };
    }
    return undefined;
  });
  await f.open(page);
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  const old = await fillZone(page);
  await old.getByRole("button", { name: "Save", exact: true }).click();
  await started.promise;
  await old.getByRole("button", { name: "Cancel", exact: true }).click();
  await changeLocation(page, LOCATION_B);
  await expect(
    page.locator("#presence-shiftPresenceMaxAccuracyMeters"),
  ).toHaveValue("50");
  await expect(
    page.getByRole("button", { name: "Add zone", exact: true }),
  ).toBeEnabled();
  await changeLocation(page);
  await expect(
    page.getByRole("button", { name: "Add zone", exact: true }),
  ).toBeDisabled();
  await expect(page.getByTestId("shift-presence")).toContainText(
    "outcome of your request is unknown",
  );
  await expect(
    page.getByRole("button", { name: "Retry reconciliation", exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("shift-presence")).not.toContainText(
    "Retired success",
  );
  await expect(
    page.getByRole("button", { name: "Add zone", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Retry reconciliation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Add zone", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  const fresh = page.getByRole("dialog");
  await fresh.getByLabel("Label", { exact: true }).fill("New draft");
  pending.release();
  await expect(fresh).toBeVisible();
  await expect(fresh.getByLabel("Label", { exact: true })).toHaveValue(
    "New draft",
  );
  await expect(page.getByTestId("shift-presence")).not.toContainText(
    "Retired success",
  );
  expect(f.writes).toHaveLength(1);
});

test("same-scope read failure retains policy draft but authorization denial conceals data", async ({
  page,
}) => {
  let response: "OK" | "FAIL" | "DENY" = "OK";
  const f = new PresenceFixture("LM", (path, request) => {
    if (
      path.endsWith("/policy") &&
      request.method() === "GET" &&
      response !== "OK"
    )
      return {
        status: response === "FAIL" ? 503 : 403,
        body: {
          code: response === "FAIL" ? "SERVER_ERROR" : "PRESENCE_SCOPE_DENIED",
          message: "private",
          requestId: "fixture",
        },
      };
    return undefined;
  });
  await f.open(page);
  const input = page.locator("#presence-shiftPresenceMaxAccuracyMeters");
  await input.fill("77");
  response = "FAIL";
  await page
    .getByTestId("shift-presence")
    .getByRole("button", { name: "Refresh", exact: true })
    .first()
    .click();
  await expect(page.getByTestId("shift-presence")).toContainText(
    "Could not read current state",
  );
  await expect(input).toHaveValue("77");
  await expect(input).toBeDisabled();
  response = "DENY";
  await page
    .getByTestId("shift-presence")
    .getByRole("button", { name: "Retry", exact: true })
    .first()
    .click();
  await expect(input).toHaveCount(0);
  await expect(page.getByTestId("presence-exceptions")).toHaveCount(0);
  expect(f.writes).toHaveLength(0);
});
