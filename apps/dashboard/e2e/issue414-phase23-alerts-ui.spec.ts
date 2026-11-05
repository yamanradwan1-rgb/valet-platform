import { expect, test, type Page } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";

const phase23 =
  process.env.NEXT_PUBLIC_MANAGEMENT_ALERTS_PHASE1 === "enabled" &&
  process.env.NEXT_PUBLIC_MANAGEMENT_ALERTS_PHASE23 === "enabled";
const locationId = LOCATION_A.locationId;
const operationId = "d4265425-4b3a-4e90-ad37-616e02f75667";
const previewPath =
  "/v1/staff/dashboard/locations/" + locationId + "/alerts/preview-unified";
const sourcePath =
  "/v1/staff/dashboard/locations/" +
  locationId +
  "/alerts/sources-unified/ALT-05/" +
  operationId;
const seenPath = sourcePath + "/seen";
const noChromeDevIndicator = "nextjs-portal { display: none !important; }";
const takeover = {
  id: "ALT-05:" + operationId + ":" + operationId,
  category: "ALT-05",
  caseKind: "OCCURRENCE",
  sourceKind: "TAKEOVER",
  severity: "CRITICAL",
  sourceId: operationId,
  episodeId: operationId,
  locationId,
  occurredAt: "2026-11-05T10:00:00.000Z",
  title: "Emergency takeover",
  seen: false,
  seenEligible: true,
};
const stopped = {
  id: "ALT-16:" + locationId + ":current",
  category: "ALT-16",
  caseKind: "ACTIVE",
  sourceKind: "LOCATION",
  severity: "IMPORTANT",
  sourceId: locationId,
  episodeId: "current",
  locationId,
  occurredAt: null,
  title: "Location intake stopped",
};

function fixtureFor(role: "COMPANY_ADMIN" | "LOCATION_MANAGER") {
  let confirmedSeen = false;
  let puts = 0;
  let wrongWrites = 0;
  const fixture = new DashboardApiFixture({
    ...(role === "COMPANY_ADMIN"
      ? {
          companyOrganizations: [ORG_A],
          companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
        }
      : {
          locationManagerOrganizations: [ORG_A],
          locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
        }),
    override: (path, request) => {
      if (path === previewPath) {
        const items = [
          ...(role === "COMPANY_ADMIN" && !confirmedSeen ? [takeover] : []),
          stopped,
        ];
        return { body: { items, count: items.length, hasMore: false } };
      }
      if (path === sourcePath && request.method() === "GET") {
        if (
          role !== "COMPANY_ADMIN" ||
          new URL(request.url()).searchParams.get("episodeId") !== operationId
        )
          return { status: 404, body: { code: "AUTHORIZATION_DENIED" } };
        return { body: { item: takeover, valetSessionId: null } };
      }
      if (path === seenPath) {
        if (
          request.method() !== "PUT" ||
          role !== "COMPANY_ADMIN" ||
          request.postDataJSON()?.episodeId !== operationId
        ) {
          wrongWrites += 1;
          return { status: 404, body: { code: "AUTHORIZATION_DENIED" } };
        }
        puts += 1;
        confirmedSeen = true;
        return {
          body: {
            category: "ALT-05",
            episodeId: operationId,
            seenAt: "2026-11-05T10:05:00.000Z",
          },
        };
      }
      return undefined;
    },
  });
  return {
    fixture,
    puts: () => puts,
    wrongWrites: () => wrongWrites,
  };
}

async function selectScope(
  page: Page,
  role: "COMPANY_ADMIN" | "LOCATION_MANAGER",
) {
  await page.goto("/overview");
  await signInOnCurrentPage(
    page,
    role === "COMPANY_ADMIN" ? "admin@example.com" : "manager@example.com",
  );
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.locator(".management-alert-bell")).toBeVisible();
}

test("Phase23 CA: explicit Seen, current status, exact detail, no GET writes", async ({
  page,
}, testInfo) => {
  test.skip(!phase23, "Requires both public Phase-1 and Phase23 flags enabled");
  test.setTimeout(180_000);
  const { fixture, puts, wrongWrites } = fixtureFor("COMPANY_ADMIN");
  await fixture.install(page);
  await selectScope(page, "COMPANY_ADMIN");
  await expect(page.locator(".management-alert-badge")).toHaveText("2");
  expect(puts()).toBe(0);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({
      width,
      height: width === 1440 ? 900 : 844,
    });
    for (const variant of ["en-light", "en-dark", "ar-dark", "ar-light"]) {
      if (variant === "en-dark") {
        await page.getByRole("button", { name: "Dark" }).click();
      } else if (variant === "ar-dark") {
        await page.getByRole("button", { name: "Language" }).click();
      } else if (variant === "ar-light") {
        await page.locator(".theme-segment").first().click();
      }
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        variant.startsWith("ar") ? "rtl" : "ltr",
      );
      const bell = page.locator(".management-alert-bell");
      await bell.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const bounds = await dialog.evaluate((element) => {
        const rectangle = element.getBoundingClientRect();
        return {
          left: rectangle.left,
          right: rectangle.right,
          width: document.documentElement.clientWidth,
        };
      });
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(bounds.width);
      await expect(
        dialog.getByText(
          variant.startsWith("ar")
            ? "استلام طارئ للمهمة"
            : "Emergency takeover",
        ),
      ).toBeVisible();
      await expect(
        dialog.getByText(
          variant.startsWith("ar")
            ? "توقف استقبال السيارات في الموقع"
            : "Location intake stopped",
        ),
      ).toBeVisible();
      await expect(
        dialog.locator("button").filter({
          hasText: /Mark Seen|تحديد كمُشاهَد/,
        }),
      ).toHaveCount(1);
      await page.screenshot({
        path: testInfo.outputPath("phase23-" + variant + "-" + width + ".png"),
        animations: "disabled",
        caret: "hide",
        style: noChromeDevIndicator,
      });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(bell).toBeFocused();
    }
    await page.getByRole("button", { name: /Language|اللغة/ }).click();
    await page.locator(".theme-segment").first().click();
  }
  expect(puts()).toBe(0);
  await page.locator(".management-alert-bell").click();
  const dialog = page.getByRole("dialog");
  await dialog
    .locator(".management-alert-list li")
    .first()
    .getByRole("button", { name: /View source details/ })
    .click();
  await expect(dialog.locator(".management-alert-source-facts")).toBeVisible();
  await expect(dialog.locator(".management-alert-source-facts")).toContainText(
    "ALT-05",
  );
  await expect.poll(() => fixture.count(sourcePath)).toBe(1);
  expect(puts()).toBe(0);
  await dialog.getByRole("button", { name: "Mark Seen" }).click();
  await expect.poll(puts).toBe(1);
  await expect(page.locator(".management-alert-badge")).toHaveText("1");
  await expect(dialog.getByText("Emergency takeover")).toHaveCount(0);
  await expect(dialog.getByText("Location intake stopped")).toBeVisible();
  expect(wrongWrites()).toBe(0);
});

test("Phase23 LM cannot mark CA-only occurrence and retains own Location condition", async ({
  page,
}) => {
  test.skip(!phase23, "Requires both public Phase-1 and Phase23 flags enabled");
  const { fixture, puts, wrongWrites } = fixtureFor("LOCATION_MANAGER");
  await fixture.install(page);
  await selectScope(page, "LOCATION_MANAGER");
  await expect(page.locator(".management-alert-badge")).toHaveText("1");
  await page.locator(".management-alert-bell").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Location intake stopped")).toBeVisible();
  await expect(dialog.getByText("Emergency takeover")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Mark Seen" })).toHaveCount(
    0,
  );
  expect(puts()).toBe(0);
  expect(wrongWrites()).toBe(0);
});
