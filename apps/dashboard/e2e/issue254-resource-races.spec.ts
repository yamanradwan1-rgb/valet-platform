import { expect, test, type Page } from "@playwright/test";

import { LOCATION_A, LOCATION_B, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { enterKeysSpots, switchTopbarLocation } from "./support/keys-spots";
import {
  deferred,
  keyPage,
  openSpots,
  resourceFixture,
  resourcePath,
  spotPage,
} from "./support/issue254-resources";

type Family = "keys" | "spots";
const body = (family: Family, marker: string, cursor: string | null = null) =>
  family === "keys" ? keyPage(marker, cursor) : spotPage(marker, cursor);
const denial = {
  code: "SERVICE_UNAVAILABLE",
  message: "stale failure",
  requestId: "old-epoch",
};

async function openFamily(page: Page, family: Family) {
  if (family === "spots") await openSpots(page);
  else
    await page
      .getByRole("tab", { name: "Operational Keys", exact: true })
      .click();
}

for (const family of ["keys", "spots"] as const) {
  for (const outcome of ["success", "failure"] as const) {
    test(`${family}: A to B to A fences manually held old ${outcome}`, async ({
      page,
    }) => {
      const started = deferred();
      const release = deferred();
      const returned = deferred();
      let revisited = false;
      const cursors: Array<string | null> = [];
      const fixture = resourceFixture(async (path, request) => {
        if (path === resourcePath(family)) {
          cursors.push(new URL(request.url()).searchParams.get("cursor"));
          if (!revisited) {
            started.resolve();
            await release.promise;
            returned.resolve();
            return outcome === "success"
              ? { body: body(family, "OLDVEHICLE") }
              : { status: 503, body: denial };
          }
          return { body: body(family, "FRESHVEHICLE") };
        }
        if (path === resourcePath(family, LOCATION_B.locationId))
          return { body: body(family, "BVEHICLE") };
        return undefined;
      });
      await fixture.install(page);
      await enterKeysSpots(page);
      await openFamily(page, family);
      await started.promise;
      await switchTopbarLocation(page, LOCATION_B.name);
      await openFamily(page, family);
      await expect(page.getByText("BVEHICLE", { exact: true })).toBeVisible();
      await expect(page.getByText("OLDVEHICLE", { exact: true })).toHaveCount(
        0,
      );
      revisited = true;
      await switchTopbarLocation(page, LOCATION_A.name);
      await openFamily(page, family);
      await expect(
        page.getByText("FRESHVEHICLE", { exact: true }),
      ).toBeVisible();
      release.resolve();
      await returned.promise;
      await page.waitForTimeout(100);
      await expect(
        page.getByText("FRESHVEHICLE", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText("OLDVEHICLE", { exact: true })).toHaveCount(
        0,
      );
      await expect(
        page.getByTestId("md03-page").getByRole("alert"),
      ).toHaveCount(0);
      expect(cursors.every((cursor) => cursor === null)).toBe(true);
    });
  }

  test(`${family}: page cursors reset across Location epochs`, async ({
    page,
  }) => {
    const observed: Array<{ location: string; cursor: string | null }> = [];
    const fixture = resourceFixture((path, request) => {
      for (const location of [LOCATION_A, LOCATION_B]) {
        if (path !== resourcePath(family, location.locationId)) continue;
        const cursor = new URL(request.url()).searchParams.get("cursor");
        observed.push({ location: location.name, cursor });
        return {
          body: body(
            family,
            cursor ? "PAGE2VEHICLE" : "PAGE1VEHICLE",
            cursor ? null : "cursor_page_12345678",
          ),
        };
      }
      return undefined;
    });
    await fixture.install(page);
    await enterKeysSpots(page);
    await openFamily(page, family);
    await expect(page.getByText("PAGE1VEHICLE", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText("PAGE2VEHICLE", { exact: true })).toBeVisible();
    await switchTopbarLocation(page, LOCATION_B.name);
    await openFamily(page, family);
    await expect(page.getByText("PAGE1VEHICLE", { exact: true })).toBeVisible();
    expect(
      observed
        .filter((entry) => entry.location === LOCATION_B.name)
        .every((entry) => entry.cursor === null),
    ).toBe(true);
    await switchTopbarLocation(page, LOCATION_A.name);
    await openFamily(page, family);
    await expect(page.getByText("PAGE1VEHICLE", { exact: true })).toBeVisible();
    expect(observed.at(-1)?.cursor).toBeNull();
  });

  for (const replacement of [false, true]) {
    test(`${family}: logout ${replacement ? "and identity replacement" : ""} fences vehicle data`, async ({
      page,
    }) => {
      const started = deferred();
      const release = deferred();
      const returned = deferred();
      let hold = false;
      let replaced = false;
      const fixture = resourceFixture(async (path) => {
        if (path !== resourcePath(family)) return undefined;
        if (hold && !replaced) {
          started.resolve();
          await release.promise;
          returned.resolve();
          return { body: body(family, "LATEOLDVEHICLE") };
        }
        return {
          body: body(
            family,
            replaced ? "NEWIDENTITYVEHICLE" : "OLDIDENTITYVEHICLE",
          ),
        };
      });
      await fixture.install(page);
      await enterKeysSpots(page);
      await openFamily(page, family);
      await expect(
        page.getByText("OLDIDENTITYVEHICLE", { exact: true }),
      ).toBeVisible();
      hold = true;
      if (family === "spots") {
        await page.getByRole("tab", { name: "Key Slots", exact: true }).click();
        await page
          .getByRole("tab", { name: "Parking Spots", exact: true })
          .click();
      } else {
        await openSpots(page);
        await openFamily(page, family);
      }
      await started.promise;
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Sign in" }),
      ).toBeVisible();
      await expect(
        page.getByText("OLDIDENTITYVEHICLE", { exact: true }),
      ).toHaveCount(0);
      if (replacement) {
        replaced = true;
        await signInOnCurrentPage(page, "replacement@example.com");
        await page.getByRole("button", { name: ORG_A.name }).click();
        await page
          .getByRole("button", { name: LOCATION_A.name, exact: true })
          .click();
        await openFamily(page, family);
        await expect(
          page.getByText("NEWIDENTITYVEHICLE", { exact: true }),
        ).toBeVisible();
      }
      release.resolve();
      await returned.promise;
      await page.waitForTimeout(100);
      await expect(
        page.getByText("LATEOLDVEHICLE", { exact: true }),
      ).toHaveCount(0);
      if (replacement)
        await expect(
          page.getByText("NEWIDENTITYVEHICLE", { exact: true }),
        ).toBeVisible();
      else
        await expect(
          page.getByRole("heading", { name: "Sign in" }),
        ).toBeVisible();
    });
  }
}
