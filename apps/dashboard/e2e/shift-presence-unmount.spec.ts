import { expect, test, type Page } from "@playwright/test";
import {
  PresenceFixture,
  attendanceZone,
  caBase,
  fillZone,
} from "./support/presence-fixtures";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { ORG_A, LOCATION_A } from "./support/fixture-data";

function uncertainCreate() {
  let mutationId = "";
  let zoneId = "";
  let committed = false;
  const f = new PresenceFixture("CA", (path, request, state) => {
    if (path === `${caBase}/zones` && request.method() === "POST") {
      ({ mutationId, zoneId } = request.postDataJSON());
      return {
        status: 503,
        body: {
          code: "SERVER_ERROR",
          message: "private",
          requestId: "fixture",
        },
      };
    }
    if (path.includes("/results/")) {
      expect(path).toBe(`${caBase}/results/${mutationId}`);
      const query = new URL(request.url()).searchParams;
      expect(query.get("kind")).toBe("ZONE");
      expect(query.get("entityId")).toBe(zoneId);
      return {
        body: {
          mutationId,
          attribution: committed ? "COMMITTED" : "UNKNOWN",
          effect: committed ? "CHANGED" : null,
          entityId: committed ? zoneId : null,
          revision: committed ? 1 : null,
          canonical: {
            kind: "ZONE",
            value: {
              zone: committed
                ? {
                    ...attendanceZone(),
                    id: zoneId,
                    label: "Exact committed zone",
                  }
                : null,
              readiness: state.policy.readiness,
            },
          },
        },
      };
    }
    return undefined;
  });
  return {
    f,
    commit: () => {
      committed = true;
    },
  };
}
async function createUnknown(page: Page, f: PresenceFixture) {
  await f.open(page);
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  const dialog = await fillZone(page);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toContainText("outcome of your request is unknown");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
}
async function expectRetained(page: Page) {
  await expect(page.getByTestId("shift-presence")).toContainText(
    "outcome of your request is unknown",
  );
  await expect(
    page.getByRole("button", { name: "Add zone", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Retry reconciliation", exact: true }),
  ).toBeEnabled();
  await expect(
    page.locator("#presence-shiftPresenceMaxAccuracyMeters"),
  ).toBeDisabled();
}
async function leaveAndReturn(page: Page) {
  await page.getByRole("link", { name: "Help", exact: true }).click();
  await expect(page.getByTestId("shift-presence")).toHaveCount(0);
  await page
    .getByRole("link", { name: "Policies & Settings", exact: true })
    .click();
  await page.getByRole("tab", { name: "Location Overrides" }).click();
}

test("UNKNOWN survives Company/Location tab unmount and clears only on the exact committed receipt", async ({
  page,
}) => {
  const { f, commit } = uncertainCreate();
  await createUnknown(page, f);
  await page.getByRole("tab", { name: "Company Defaults" }).click();
  await expect(
    page.getByRole("button", { name: "Add zone", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Location Overrides" }).click();
  await expectRetained(page);
  commit();
  await page
    .getByRole("button", { name: "Retry reconciliation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Add zone", exact: true }),
  ).toBeEnabled();
  expect(f.writes).toHaveLength(1);
  expect(f.requests.filter((url) => url.includes("/results/"))).toHaveLength(2);
});

test("UNKNOWN survives leaving and returning to Settings in the same authenticated lifetime", async ({
  page,
}) => {
  const { f, commit } = uncertainCreate();
  await createUnknown(page, f);
  await leaveAndReturn(page);
  await expectRetained(page);
  commit();
  await page
    .getByRole("button", { name: "Retry reconciliation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Add zone", exact: true }),
  ).toBeEnabled();
  expect(f.writes).toHaveLength(1);
});

test("logout after retained UNKNOWN purges it before replacement identity returns", async ({
  page,
}) => {
  const { f, commit } = uncertainCreate();
  await createUnknown(page, f);
  await leaveAndReturn(page);
  await expectRetained(page);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  commit();
  await signInOnCurrentPage(page, "replacement@example.com");
  await page.getByRole("button", { name: ORG_A.name, exact: true }).click();
  await page
    .getByRole("button", { name: LOCATION_A.name, exact: true })
    .click();
  await page.getByRole("tab", { name: "Location Overrides" }).click();
  await expect(
    page.getByRole("button", { name: "Add zone", exact: true }),
  ).toBeEnabled();
  await expect(page.getByTestId("shift-presence")).not.toContainText(
    "outcome of your request is unknown",
  );
  await expect(page.getByTestId("shift-presence")).not.toContainText(
    "Exact committed zone",
  );
  await expect(
    page.getByRole("button", { name: "Retry reconciliation", exact: true }),
  ).toHaveCount(0);
  expect(f.requests.filter((url) => url.includes("/results/"))).toHaveLength(1);
  expect(f.writes).toHaveLength(1);
});

test("definite rejected write is not resurrected as UNKNOWN by tab unmount", async ({
  page,
}) => {
  const f = new PresenceFixture("CA", (path, request) =>
    path === `${caBase}/zones` && request.method() === "POST"
      ? {
          status: 422,
          body: {
            code: "VALIDATION_ERROR",
            message: "private",
            requestId: "fixture",
          },
        }
      : undefined,
  );
  await f.open(page);
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  const dialog = await fillZone(page);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toContainText("Check the required fields");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("tab", { name: "Company Defaults" }).click();
  await page.getByRole("tab", { name: "Location Overrides" }).click();
  await expect(
    page.getByRole("button", { name: "Add zone", exact: true }),
  ).toBeEnabled();
  expect(f.requests.filter((url) => url.includes("/results/"))).toHaveLength(0);
  expect(f.writes).toHaveLength(1);
});

test("pre-dispatch auth refresh failure never creates UNKNOWN or sends a zone write", async ({
  page,
}) => {
  let failRefresh = false;
  const f = new PresenceFixture("CA", (path) =>
    failRefresh && path === "/v1/staff/auth/refresh"
      ? {
          status: 503,
          body: {
            code: "SERVER_ERROR",
            message: "private",
            requestId: "fixture",
          },
        }
      : undefined,
  );
  await f.open(page);
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  const dialog = await fillZone(page);
  failRefresh = true;
  await page.clock.setFixedTime(new Date("2100-01-01T00:00:00Z"));
  const before = f.fixture.count("/v1/staff/auth/refresh");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(() => f.fixture.count("/v1/staff/auth/refresh"))
    .toBe(before + 1);
  await expect(dialog).toContainText("The request could not be completed");
  await expect(
    dialog.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();
  await expect(dialog).not.toContainText("outcome of your request is unknown");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("tab", { name: "Company Defaults" }).click();
  await page.getByRole("tab", { name: "Location Overrides" }).click();
  await expect(
    page.getByRole("button", { name: "Retry reconciliation", exact: true }),
  ).toHaveCount(0);
  expect(f.writes).toHaveLength(0);
  expect(f.requests.filter((url) => url.includes("/results/"))).toHaveLength(0);
});
