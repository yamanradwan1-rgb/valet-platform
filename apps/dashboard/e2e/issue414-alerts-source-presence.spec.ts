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
const timing = `/v1/staff/management/organizations/${org}/locations/${location}/alert-timing-preferences`;

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

function presenceFixture() {
  return new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [org]: [LOCATION_A] },
    override: (path, request) => {
      if (path.endsWith("/configuration")) {
        return { body: locationManagerConfiguration() };
      }
      if (path === preview) {
        return { body: { count: 1, hasMore: false, items: [item] } };
      }
      if (path === timing) {
        return {
          body: {
            organizationId: org,
            userId: "fixture-presence-lm",
            revision: 0,
            updatedAt: null,
            values: {
              alt01GraceSeconds: 0,
              alt02QueueSeconds: 60,
              alt03DeclineSeconds: 0,
              alt04StageSeconds: 300,
              alt06HandoffSeconds: 300,
              alt11UnknownPaymentSeconds: 120,
            },
          },
        };
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
}

test("LM Presence source link opens same mounted Studio's exact, fresh source reader", async ({
  page,
}) => {
  test.skip(!enabled, "Requires feature-on isolated server");
  const fixture = presenceFixture();
  await fixture.install(page);
  await page.goto("/policies?section=alertsTiming");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(
    page.getByRole("heading", { name: "Alert Timing" }),
  ).toBeVisible();
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
  await expect(
    stale.getByText("Source details are temporarily unavailable."),
  ).toBeVisible();
  await expect(stale.getByText(item.title)).toHaveCount(0);
  expect(fixture.count(detail)).toBe(2);
});

test("canceling a dirty timing draft prevents stale Presence alert navigation", async ({
  page,
}) => {
  test.skip(!enabled, "Requires feature-on isolated server");
  const fixture = presenceFixture();
  await fixture.install(page);
  await page.goto("/policies?section=alertsTiming");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(
    page.getByRole("heading", { name: "Alert Timing" }),
  ).toBeVisible();
  const grace = page.getByRole("spinbutton", {
    name: "After retrieval SLA breach",
  });
  await expect(grace).toHaveValue("0");
  await grace.fill("30");
  await expect(
    page.getByRole("button", { name: "Save my timing" }),
  ).toBeEnabled();
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    await dialog.dismiss();
  });
  await page.locator(".management-alert-bell").click();
  await page.getByRole("link", { name: "View source details" }).click();
  await expect(page).toHaveURL(/section=alertsTiming/u);
  await expect(page).not.toHaveURL(
    /alertCategory|alertSourceId|alertEpisodeId/u,
  );
  await expect(grace).toHaveValue("30");
  expect(fixture.count(detail)).toBe(0);

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('.ps-section-links a[href*="section=presence"]').click();
  await expect(page).toHaveURL(/section=presence/u);
  await expect(
    page.getByRole("dialog", { name: "Source alert details" }),
  ).toHaveCount(0);
  expect(fixture.count(detail)).toBe(0);
});
