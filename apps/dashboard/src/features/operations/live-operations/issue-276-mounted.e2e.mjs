import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "../../../../e2e/support/dashboard-api-fixture";
import { signInOnCurrentPage } from "../../../../e2e/support/foundation-ui";
import {
  sessionItem,
  stateCounts,
} from "../../../../e2e/support/operations-fixtures";

const livePath = (locationId) =>
  `/v1/staff/dashboard/locations/${locationId}/overview/live-sessions`;
const vehiclesPath = (locationId) =>
  `/v1/staff/dashboard/locations/${locationId}/overview/sessions`;
const countsPath = (locationId) =>
  `/v1/staff/dashboard/locations/${locationId}/overview/session-state-counts`;

const parker = { firstName: "SyntheticNora", lastName: "Parker" };
const original = { firstName: "SyntheticCarmen", lastName: "Checker" };

function liveRow(suffix, descriptor, overrides = {}) {
  return sessionItem({
    sessionId: `77777777-7777-4777-8777-7777777777${suffix}`,
    currentAssigneeMembershipId: null,
    activeTask: null,
    vehicle: {
      vehicleId: `88888888-8888-4888-8888-8888888888${suffix}`,
      color: null,
      make: null,
      model: null,
      plateCountry: null,
      plateNumberNormalized: null,
      temporaryDescriptor: descriptor,
    },
    checkedInBy: original,
    parkedBy: parker,
    parkingCompletionProof: "PROVEN",
    ...overrides,
  });
}

async function enterLocation(page, locationName) {
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: locationName }).click();
}

async function switchLocation(page, locationName, withDrawerOpen = false) {
  const trigger = page.locator("button.location-context");
  if (withDrawerOpen) {
    // A revoked scope can originate outside the modal; directly invoke the
    // existing switch control, without bypassing its authority proof.
    await trigger.evaluate((button) => button.click());
  } else {
    await trigger.click();
  }
  const option = page.getByRole("option", { name: locationName });
  await expect(option).toBeVisible();
  if (withDrawerOpen) {
    await option.evaluate((button) => button.click());
  } else {
    await option.click();
  }
}

test("mounted Live history uses strict B route, proven Parker/Unknown, current Retrieval and Vehicles drawer parity", async ({ page }) => {
  const rows = [
    liveRow("21", "Proven parking vehicle"),
    liveRow("22", "Proven but unnamed vehicle", { parkedBy: null }),
    liveRow("23", "No parking record vehicle", {
      parkedBy: null,
      parkingCompletionProof: "NO_RECORD",
    }),
    liveRow("24", "Unverifiable parking vehicle", {
      parkedBy: null,
      parkingCompletionProof: "UNVERIFIABLE",
    }),
    liveRow("25", "Queued retrieval vehicle", {
      state: "REQUESTED",
      activeTask: {
        taskId: "77777777-7777-4777-8777-777777777725",
        assignee: null,
      },
    }),
    liveRow("26", "Assigned retrieval vehicle", {
      state: "RETRIEVING",
      activeTask: {
        taskId: "77777777-7777-4777-8777-777777777726",
        assignee: {
          membershipId: "55555555-5555-4555-8555-555555555555",
          identity: {
            firstName: "SyntheticHadi",
            lastName: "Current",
            email: "synthetic-current@example.test",
          },
        },
      },
    }),
  ];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === livePath(LOCATION_A.locationId)) {
        return { body: { items: rows, nextCursor: null } };
      }
      if (path === vehiclesPath(LOCATION_A.locationId)) {
        return {
          body: {
            items: [sessionItem({ activeTask: null })],
            nextCursor: null,
          },
        };
      }
      if (path === countsPath(LOCATION_A.locationId)) {
        return { body: stateCounts() };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await enterLocation(page, LOCATION_A.name);

  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader")).toHaveCount(6);
  await expect(table.getByRole("columnheader", { name: "Staff" })).toBeVisible();
  await expect(table.getByRole("row").filter({ hasText: "Proven parking vehicle" }))
    .toContainText("SyntheticNora Parker");
  const provenUnnamed = table.getByRole("row").filter({ hasText: "Proven but unnamed vehicle" });
  await expect(provenUnnamed).toContainText("Unknown");
  await expect(provenUnnamed).toContainText("Parked by");
  const noHistory = table.getByRole("row").filter({ hasText: "No parking record vehicle" });
  await expect(noHistory).toContainText("Unknown");
  await expect(noHistory).not.toContainText("Parked by");
  const unverifiable = table.getByRole("row").filter({ hasText: "Unverifiable parking vehicle" });
  await expect(unverifiable).toContainText("Unknown");
  await expect(unverifiable).not.toContainText("Parked by");
  await expect(table.getByRole("row").filter({ hasText: "Queued retrieval vehicle" }))
    .toContainText("Unassigned");
  await expect(table.getByRole("row").filter({ hasText: "Assigned retrieval vehicle" }))
    .toContainText("SyntheticHadi Current");
  await expect(table).not.toContainText("synthetic-current@example.test");
  await expect(table).not.toContainText("SyntheticCarmen Checker");
  expect(fixture.count(livePath(LOCATION_A.locationId))).toBeGreaterThan(0);
  expect(fixture.count(vehiclesPath(LOCATION_A.locationId))).toBe(0);

  await table
    .getByRole("row")
    .filter({ hasText: "Proven parking vehicle" })
    .getByRole("button", { name: /Details/u })
    .click();
  const liveDialog = page.getByRole("dialog");
  await expect(liveDialog).toContainText("SyntheticCarmen Checker");
  await expect(liveDialog).toContainText("SyntheticNora Parker");
  await expect(liveDialog).toContainText("Original check-in staff");
  await page.keyboard.press("Escape");

  for (const [descriptor, shouldAssertParker] of [
    ["Proven but unnamed vehicle", true],
    ["No parking record vehicle", false],
    ["Unverifiable parking vehicle", false],
  ]) {
    await table.getByRole("row").filter({ hasText: descriptor })
      .getByRole("button", { name: /Details/u }).click();
    if (shouldAssertParker) {
      await expect(page.getByRole("dialog")).toContainText("Parked by");
      await expect(page.getByRole("dialog")).toContainText("Unknown");
    } else {
      await expect(page.getByRole("dialog")).not.toContainText("Parked by");
    }
    await page.keyboard.press("Escape");
  }

  // The Vehicles consumer must use its original endpoint and old shared drawer.
  await page.getByRole("link", { name: "Vehicles" }).click();
  await expect(page.getByRole("heading", { name: "Vehicles", level: 1 })).toBeVisible();
  await expect(page.getByRole("table").getByRole("columnheader")).toHaveCount(5);
  await expect(page.getByRole("table").getByRole("columnheader", { name: "Vehicle" }))
    .toBeVisible();
  await page.getByRole("table").getByRole("button", { name: /Details/u }).first().click();
  const vehiclesDialog = page.getByRole("dialog");
  await expect(vehiclesDialog).not.toContainText("Original check-in staff");
  await expect(vehiclesDialog).not.toContainText("SyntheticNora Parker");
  expect(fixture.count(vehiclesPath(LOCATION_A.locationId))).toBeGreaterThan(0);
});

test("mounted A→B→A replaces historical rows and tears down an open drawer", async ({ page }) => {
  let aCalls = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path) => {
      if (
        path === countsPath(LOCATION_A.locationId) ||
        path === countsPath(LOCATION_B.locationId)
      ) {
        return { body: stateCounts() };
      }
      if (path === livePath(LOCATION_A.locationId)) {
        aCalls += 1;
        return {
          body: {
            items: [
              liveRow("31", aCalls === 1 ? "Old A vehicle" : "Fresh A vehicle", {
                parkedBy: aCalls === 1
                  ? { firstName: "OldA", lastName: "Parker" }
                  : { firstName: "FreshA", lastName: "Parker" },
              }),
            ],
            nextCursor: null,
          },
        };
      }
      if (path === livePath(LOCATION_B.locationId)) {
        return {
          body: {
            items: [liveRow("32", "B vehicle", {
              parkedBy: { firstName: "ScopedB", lastName: "Parker" },
            })],
            nextCursor: null,
          },
        };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await enterLocation(page, LOCATION_A.name);
  await expect(page.getByRole("table")).toContainText("OldA Parker");
  await page.getByRole("table").getByRole("button", { name: /Details/u }).click();
  await expect(page.getByRole("dialog")).toContainText("OldA Parker");
  await switchLocation(page, LOCATION_B.name, true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("table")).toContainText("ScopedB Parker");
  await expect(page.getByText("OldA Parker")).toHaveCount(0);

  await switchLocation(page, LOCATION_A.name);
  await expect(page.getByRole("table")).toContainText("FreshA Parker");
  await expect(page.getByText("OldA Parker")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(aCalls).toBeGreaterThanOrEqual(2);
});

test("mounted logout tears down historical names when a drawer is open", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === countsPath(LOCATION_A.locationId)) {
        return { body: stateCounts() };
      }
      if (path === livePath(LOCATION_A.locationId)) {
        return {
          body: {
            items: [liveRow("41", "Protected synthetic session", {
              parkedBy: { firstName: "LogoutSecret", lastName: "Parker" },
            })],
            nextCursor: null,
          },
        };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await enterLocation(page, LOCATION_A.name);
  await expect(page.getByRole("table")).toContainText("LogoutSecret Parker");
  await page.getByRole("table").getByRole("button", { name: /Details/u }).click();
  await expect(page.getByRole("dialog")).toContainText("LogoutSecret Parker");
  // Session revocation can originate outside the open modal.
  await page.getByRole("button", { name: "Sign out" })
    .evaluate((button) => button.click());
  await expect(page.getByRole("heading", { name: "Sign in", level: 1 }))
    .toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("LogoutSecret Parker")).toHaveCount(0);
});
