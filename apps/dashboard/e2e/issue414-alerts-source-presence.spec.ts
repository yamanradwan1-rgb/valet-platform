import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { locationManagerConfiguration } from "./support/administration-fixtures";
import { signInOnCurrentPage } from "./support/foundation-ui";

const enabled = process.env.NEXT_PUBLIC_MANAGEMENT_ALERTS_PHASE1 === "enabled";
const location = LOCATION_A.locationId;
const org = ORG_A.organizationId;
const preview = `/v1/staff/dashboard/locations/${location}/alerts/preview`;
const detail = `/v1/staff/dashboard/locations/${location}/alerts/sources/ALT-12/exception-1`;

const item = {
  id: "attention-presence",
  category: "ALT-12",
  severity: "IMPORTANT",
  sourceKind: "PRESENCE",
  sourceId: "exception-1",
  episodeId: "exception-window-1",
  locationId: location,
  occurredAt: "2026-11-04T09:10:00Z",
  title: "Presence exception awaiting review",
};

test("LM Presence source link opens same mounted Studio's exact, fresh source reader", async ({
  page,
}) => {
  test.skip(!enabled, "Requires feature-on isolated server");
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [org]: [LOCATION_A] },
    override: (path, request) => {
      if (path.endsWith("/configuration")) {
        return { body: locationManagerConfiguration() };
      }
      if (path === preview) {
        return { body: { count: 1, hasMore: false, items: [item] } };
      }
      if (path === detail) {
        const episode = new URL(request.url()).searchParams.get("episodeId");
        return episode === item.episodeId
          ? { body: { item, valetSessionId: null } }
          : {
              status: 404,
              body: {
                code: "AUTHORIZATION_DENIED",
                message: "Unavailable",
                requestId: "e2e-concealed",
              },
            };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/policies?section=alertsTiming");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByRole("heading", { name: "Alert Timing" })).toBeVisible();
  await expect(page.locator(".management-alert-badge")).toHaveText("1");
  await page.locator(".management-alert-bell").click();
  await page.getByRole("link", { name: "View source details" }).click();
  await expect(page).toHaveURL(/section=presence.*alertCategory=ALT-12/u);
  const modal = page.getByRole("dialog", { name: "Source alert details" });
  await expect(modal).toBeVisible();
  await expect(modal.getByText(item.title)).toBeVisible();
  expect(fixture.count(detail)).toBe(1);
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(page).not.toHaveURL(/alertCategory/u);

  await page.goto(
    "/policies?section=presence&alertCategory=ALT-12" +
      "&alertSourceId=exception-1&alertEpisodeId=expired-episode",
  );
  const stale = page.getByRole("dialog", { name: "Source alert details" });
  await expect(stale).toBeVisible();
  await expect(stale.getByText("Source details are temporarily unavailable.")).toBeVisible();
  await expect(stale.getByText(item.title)).toHaveCount(0);
  expect(fixture.count(detail)).toBe(2);
});
