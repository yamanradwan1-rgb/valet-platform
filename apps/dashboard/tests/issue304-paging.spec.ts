import { expect, test, type Request } from "@playwright/test";
import { LOCATION_A } from "../e2e/support/dashboard-api-fixture";
import { enterInspector, inspector, selectFamily, setLocale } from "./issue304-contract";
import { issue304Fixture } from "./issue304-fixture";

type Family = "keys" | "spots";
const base = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/physical-resources/overview`;
const cursorNames = ["issue304cursor50", "issue304cursor100"];
const stamp = "2026-10-20T00:00:00.000Z";
const makeUuid = (family: Family, index: number) =>
  `${family === "keys" ? "a" : "b"}${String(index).padStart(7, "0")}-1111-4111-8111-111111111111`;

function records(family: Family) {
  return Array.from({ length: 125 }, (_, index) => {
    const code = index === 124 ? (family === "keys" ? "K-LAST" : "P-LAST") :
      `${family === "keys" ? "K" : "P"}-${String(index + 1).padStart(3, "0")}`;
    const active = true;
    const busy = index === 124;
    if (family === "keys") return {
      keySlotId: makeUuid(family, index + 1), code, label: null, status: "ACTIVE",
      usage: busy ? "IN_USE" : "AVAILABLE",
      holdingSessionId: busy ? makeUuid("spots", 9000) : null,
      holdingVehicle: busy ? { plateNumberNormalized: "DEMO 9933", temporaryDescriptor: null } : null,
    };
    return {
      parkingSpotId: makeUuid(family, index + 1), code, label: code, status: "ACTIVE",
      usage: busy ? "OCCUPIED" : "AVAILABLE",
      createdAt: stamp, updatedAt: stamp, parkingZone: null,
      occupancy: busy ? {
        sessionId: makeUuid("keys", 9000), sessionState: "PARKED",
        vehicle: { plateNumberNormalized: "DEMO 9933", temporaryDescriptor: null },
      } : null,
    };
  });
}

function pageFromRequest(family: Family, request: Request) {
  const params = new URL(request.url()).searchParams;
  const filter = params.get(family === "keys" ? "keyFilter" : "spotFilter") || "all";
  const filtered = records(family).filter((row) => {
    if (filter === "busy") return row.usage === (family === "keys" ? "IN_USE" : "OCCUPIED");
    if (filter === "available") return row.usage === "AVAILABLE";
    if (filter === "inactive") return row.status === "INACTIVE";
    return true;
  });
  const cursor = params.get(family === "keys" ? "keyCursor" : "spotCursor");
  const start = cursor ? cursorNames.indexOf(cursor) * 50 + 50 : 0;
  return { items: filtered.slice(start, start + 50),
    nextCursor: start + 50 < filtered.length ? cursorNames[Math.floor(start / 50)] : null };
}

for (const locale of ["en", "ar"] as const) {
  test(`Issue304 320px ${locale} >100 resources reachable with keyboard and server filters`, async ({ page }) => {
    const requests: string[] = [];
    const fixture = issue304Fixture({ onRequest: (path, request) => {
      if (path !== base) return undefined;
      requests.push(request.url());
      return { body: {
        counts: {
          keySlots: { configured: 125, active: 125, available: 124, inUse: 1, unknown: 0 },
          parkingSpots: { configured: 125, active: 125, available: 124, occupied: 1, unknown: 0 },
        },
        keySlots: pageFromRequest("keys", request),
        parkingSpots: pageFromRequest("spots", request),
      } };
    } });
    await fixture.install(page);
    await page.setViewportSize({ width: 320, height: 844 });
    await enterInspector(page);
    await setLocale(page, locale);
    for (const family of ["keys", "spots"] as const) {
      await selectFamily(page, family);
      const root = inspector(page);
      const code = family === "keys" ? "K-LAST" : "P-LAST";
      await root.locator('[data-c-filter="busy"]').click();
      await expect(root.locator(`[data-resource-code="${code}"]`)).toBeVisible();
      expect(requests.some((request) =>
        request.includes(`${family === "keys" ? "key" : "spot"}Filter=busy`))).toBe(true);
      await root.locator('[data-c-filter="all"]').click();
      const rows = root.locator("[data-issue304-resource-list] .c-resource");
      await expect(rows).toHaveCount(50);
      await rows.last().focus();
      await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(100);
      await rows.nth(99).focus();
      await expect(root.locator(`[data-resource-code="${code}"]`)).toBeVisible();
      expect(requests.some((request) => request.includes("issue304cursor100"))).toBe(true);
      await expect(root.getByRole("button", { name: /Next page|Previous page/u })).toHaveCount(0);
    }
  });
}
