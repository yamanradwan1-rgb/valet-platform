import { expect, test, type Page } from "@playwright/test";
import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { operationsReadReply, sessionItem } from "./support/operations-fixtures";
import { contextHelpRegistry, type ContextHelpKey } from "../src/features/help/context-help-registry";

const routes = [
  ["/live-operations", "live.page"],
  ["/vehicles", "vehicles.page"],
  ["/tasks", "tasks.page"],
  ["/maps-zones", "maps.page"],
  ["/keys", "keys.page"],
  ["/incidents", "incidents.page"],
] as const satisfies readonly (readonly [string, ContextHelpKey])[];

async function enter(page: Page, route: string) {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => path.endsWith("/overview/live-sessions")
      ? { body: { items: [{ ...sessionItem(), checkedInBy: null, parkedBy: null,
        parkingCompletionProof: "NO_RECORD" }], nextCursor: null } }
      : operationsReadReply(path),
  });
  await fixture.install(page);
  await page.goto(route);
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
}

for (const [route, key] of routes) {
  test(route + " header Help fits beside its actual title without overlap", async ({ page }) => {
    await enter(page, route);
    for (const locale of ["en", "ar"] as const) {
      if (locale === "ar") await page.getByRole("button", { name: "Language" }).click();
      const helpName = (locale === "ar" ? "مساعدة: " : "Help: ") +
        contextHelpRegistry[key][locale].title;
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        const button = page.getByRole("button", { name: helpName, exact: true });
        await expect(button).toBeVisible();
        const geometry = await button.evaluate((element) => {
          const header = element.closest('[class*="helpHeading"]')!;
          const heading = header.querySelector("h1")!;
          const subtitle = header.querySelector("p")!;
          const range = document.createRange();
          range.selectNodeContents(heading);
          const ink = range.getBoundingClientRect();
          const target = element.getBoundingClientRect();
          const subtitleBox = subtitle.getBoundingClientRect();
          const intersects = (a: DOMRect, b: DOMRect) =>
            a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
          return {
            viewportWidth: window.innerWidth,
            buttonX: target.x,
            buttonRight: target.right,
            buttonWidth: target.width,
            buttonHeight: target.height,
            titleCollision: intersects(target, ink),
            subtitleCollision: intersects(target, subtitleBox),
          };
        });
        expect(geometry.buttonWidth).toBeGreaterThanOrEqual(24);
        expect(geometry.buttonHeight).toBeGreaterThanOrEqual(24);
        expect(geometry.buttonX).toBeGreaterThanOrEqual(0);
        expect(geometry.buttonRight).toBeLessThanOrEqual(geometry.viewportWidth + 0.5);
        expect(geometry.titleCollision, JSON.stringify({ route, width, locale, geometry })).toBe(false);
        expect(geometry.subtitleCollision, JSON.stringify({ route, width, locale, geometry })).toBe(false);
      }
      if (locale === "ar") await page.getByRole("button", { name: "اللغة" }).click();
    }
  });
}
