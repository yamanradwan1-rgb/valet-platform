import { expect, test } from "@playwright/test";
import { enterR08, r08Fixture, r08Path } from "./support/r08-accountability";
import { keyItem, incidentItem } from "./support/operations-fixtures";
import { organizationEvents } from "./support/md04-audit-fixtures";
import { orgAuditPath } from "./support/md04-fixtures";
import { persistentMatches } from "./support/persistent-storage";

for (const route of ["keys", "incidents", "audit-log"] as const) {
  test(`${route} one read family, no polling/enrichment and no protected persistent storage/logout DOM`, async ({
    page,
  }, testInfo) => {
    const sentinel = `R08_PRIVATE_${route}_63179`;
    const path = route === "audit-log" ? orgAuditPath : r08Path(route);
    const item =
      route === "keys"
        ? { ...keyItem(), code: sentinel }
        : route === "incidents"
          ? { ...incidentItem(), description: sentinel }
          : {
              ...organizationEvents()[2],
              details: { kind: "CONFIGURATION", settingKey: sentinel },
            };
    const fixture = r08Fixture((target) =>
      target === path
        ? { body: { items: [item], nextCursor: null } }
        : undefined,
    );
    await enterR08(page, `/${route}`, fixture, route === "audit-log");
    await page.locator("tbody tr").first().getByRole("button").click();
    await expect(page.getByRole("dialog")).toContainText(sentinel);
    const readCount = fixture.count(path);
    // Development Strict Mode can replay the initial effect; production is one read.
    expect(readCount).toBeGreaterThanOrEqual(1);
    expect(readCount).toBeLessThanOrEqual(2);
    const settled = [...fixture.counts.entries()];
    // Bounded observation is specifically for proving absence of polling/preloading.
    await page.waitForTimeout(750);
    expect([...fixture.counts.entries()]).toEqual(settled);
    const business = settled.filter(
      ([family]) =>
        family.includes("/overview/") || family.endsWith("/audit-events"),
    );
    expect(business).toEqual([[path, readCount]]);
    expect(
      settled.filter(([family]) =>
        /\/staff-directory|\/visit-vehicles|\/sessions\//u.test(family),
      ),
    ).toEqual([]);
    await testInfo.attach("requests", {
      body: JSON.stringify(settled, null, 2),
      contentType: "application/json",
    });
    expect(await persistentMatches(page, sentinel)).toEqual({
      local: [],
      session: [],
      indexed: [],
      cache: [],
    });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(sentinel);
    await page.goBack();
    await expect(page.locator("body")).not.toContainText(sentinel);
  });
}
