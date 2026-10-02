import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { enterKeysSpots } from "./support/keys-spots";
import {
  keyPage,
  openSpots,
  resourceFixture,
  resourcePath,
  resourceReply,
  sessionId,
  spotPage,
} from "./support/issue254-resources";

test("vehicle rows preserve usage/configuration, lazy bounded requests and storage privacy", async ({
  page,
}) => {
  const fixture = resourceFixture((path) => {
    if (path === resourcePath("keys"))
      return { body: keyPage("12345", "next_keys_123456") };
    if (path === resourcePath("spots"))
      return { body: spotPage("12345", "next_spots_123456") };
    return undefined;
  });
  await fixture.install(page);
  await enterKeysSpots(page);
  const emptyKey = page.getByRole("row").filter({ hasText: "K-0" });
  const heldKey = page.getByRole("row").filter({ hasText: "K-1" });
  const descriptorKey = page.getByRole("row").filter({ hasText: "K-2" });
  await expect(emptyKey).toContainText("Empty");
  await expect(emptyKey.locator("td").nth(2).locator("bdi")).toHaveCount(0);
  await expect(heldKey).toContainText("In use");
  await expect(heldKey.getByText("12345", { exact: true })).toHaveAttribute(
    "dir",
    "ltr",
  );
  await expect(
    descriptorKey.getByText("سيارة زرقاء Blue", { exact: true }),
  ).toHaveAttribute("dir", "auto");
  await expect(page.getByRole("columnheader")).toHaveCount(5);
  await expect(page.getByText(sessionId, { exact: true })).toHaveCount(0);
  expect(fixture.count(resourcePath("spots"))).toBe(0);
  expect(
    [...fixture.counts.keys()].filter((path) =>
      path.includes("physical-resources"),
    ),
  ).toEqual([]);
  const keyReads = fixture.count(resourcePath("keys"));

  await openSpots(page);
  const emptySpot = page.getByRole("row").filter({ hasText: "P-0" });
  const heldSpot = page.getByRole("row").filter({ hasText: "P-1" });
  const descriptorSpot = page.getByRole("row").filter({ hasText: "P-2" });
  await expect(emptySpot).toContainText("ACTIVE");
  await expect(emptySpot).toContainText("Available");
  await expect(emptySpot.locator("td").nth(3).locator("bdi")).toHaveCount(0);
  await expect(heldSpot).toContainText("ACTIVE");
  await expect(heldSpot).toContainText("Occupied");
  await expect(heldSpot).toContainText("Front 1");
  await expect(heldSpot).toContainText("Zone A");
  await expect(heldSpot.getByText("12345", { exact: true })).toHaveAttribute(
    "dir",
    "ltr",
  );
  await expect(descriptorSpot).toContainText("INACTIVE");
  await expect(descriptorSpot).toContainText("Occupied");
  await expect(
    descriptorSpot.getByText("سيارة زرقاء Blue", { exact: true }),
  ).toHaveAttribute("dir", "auto");
  await expect(page.getByRole("columnheader")).toHaveCount(5);
  await expect(page.getByText(sessionId, { exact: true })).toHaveCount(0);
  expect(fixture.count(resourcePath("keys"))).toBe(keyReads);
  const spotReads = fixture.count(resourcePath("spots"));
  expect(keyReads).toBeGreaterThan(0);
  expect(keyReads).toBeLessThanOrEqual(2);
  expect(spotReads).toBeGreaterThan(0);
  expect(spotReads).toBeLessThanOrEqual(2);
  const counts = [...fixture.counts.entries()];
  await test.info().attach("resource-request-budget", {
    body: JSON.stringify({ keyReads, spotReads, counts }, null, 2),
    contentType: "application/json",
  });
  await page.waitForTimeout(5500);
  expect([...fixture.counts.entries()]).toEqual(counts);
  expect(
    [...fixture.counts.keys()].filter((path) =>
      /\/overview\/(sessions|tasks)|\/vehicles\//u.test(path),
    ),
  ).toEqual([]);
  const storage = await page.evaluate(async () => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
    databases: await indexedDB.databases(),
    caches: await caches.keys(),
  }));
  expect(JSON.stringify(storage)).not.toMatch(
    /12345|سيارة زرقاء|P-1|K-1|44444444-4444/u,
  );
  expect(storage.databases).toEqual([]);
  expect(storage.caches).toEqual([]);
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(emptySpot).toContainText("متاح");
  await expect(heldSpot).toContainText("مشغول");
  await expect(heldSpot.getByText("12345", { exact: true })).toHaveAttribute(
    "dir",
    "ltr",
  );
  await page
    .getByRole("tab", { name: "المفاتيح التشغيلية", exact: true })
    .click();
  await expect(emptyKey).toContainText("فارغ");
  await expect(heldKey).toContainText("قيد الاستخدام");
});

test("inactive historical Locations never claim availability or display occupants", async ({
  page,
}) => {
  const inactive = { ...LOCATION_B, status: "INACTIVE" as const };
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, inactive] },
    override: (path) =>
      path === resourcePath("spots", inactive.locationId)
        ? { body: spotPage("HISTORICAL", null, true) }
        : resourceReply(path),
  });
  await fixture.install(page);
  await enterKeysSpots(page);
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope", exact: true })
    .click();
  await page
    .getByRole("option", {
      name: `${inactive.name} Historical location`,
      exact: true,
    })
    .click();
  await openSpots(page);
  await expect(page.getByText("P-1", { exact: true })).toBeVisible();
  await expect(page.getByText("Available", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Occupied", { exact: true })).toHaveCount(0);
  await expect(page.getByText("HISTORICAL", { exact: true })).toHaveCount(0);
  expect(fixture.count(resourcePath("keys", inactive.locationId))).toBe(0);
});

test("a newer server denial removes browser-held occupancy", async ({
  page,
}) => {
  let revoked = false;
  const fixture = resourceFixture((path) =>
    revoked && path === resourcePath("spots")
      ? {
          status: 404,
          body: {
            code: "AUTHORIZATION_DENIED",
            message: "Unavailable",
            requestId: "revoked",
          },
        }
      : undefined,
  );
  await fixture.install(page);
  await enterKeysSpots(page);
  await openSpots(page);
  await expect(page.getByText("12345", { exact: true })).toBeVisible();
  revoked = true;
  await page.getByRole("tab", { name: "Key Slots", exact: true }).click();
  await page.getByRole("tab", { name: "Parking Spots", exact: true }).click();
  await expect(
    page.getByTestId("physical-resources-surface").getByRole("alert"),
  ).toBeVisible();
  await expect(page.getByText("12345", { exact: true })).toHaveCount(0);
});
