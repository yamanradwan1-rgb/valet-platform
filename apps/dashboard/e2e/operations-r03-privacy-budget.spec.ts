import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { sessionItem, stateCounts } from "./support/operations-fixtures";

const sentinel = "R03_STORAGE_SENTINEL_84271";
const overview = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview`;

async function persistentMatches(page: import("@playwright/test").Page) {
  return await page.evaluate(async (needle) => {
    const storageMatches = (storage: Storage) =>
      Object.entries(storage)
        .filter(([, value]) => value.includes(needle))
        .map(([key]) => key);
    const indexedMatches: string[] = [];
    if (typeof indexedDB.databases === "function") {
      for (const info of await indexedDB.databases()) {
        if (!info.name) continue;
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(info.name!);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          for (const storeName of Array.from(database.objectStoreNames)) {
            const values = await new Promise<unknown[]>((resolve, reject) => {
              const transaction = database.transaction(storeName, "readonly");
              const request = transaction.objectStore(storeName).getAll();
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            for (const value of values) {
              let serialized = "";
              try {
                serialized =
                  typeof value === "string" ? value : JSON.stringify(value) ?? "";
              } catch {
                serialized = String(value);
              }
              if (serialized.includes(needle)) {
                indexedMatches.push(`${info.name}:${storeName}`);
              }
            }
          }
        } finally {
          database.close();
        }
      }
    }
    const cacheMatches: string[] = [];
    if ("caches" in window) {
      for (const cacheName of await caches.keys()) {
        const cache = await caches.open(cacheName);
        for (const request of await cache.keys()) {
          const response = await cache.match(request);
          if (response && (await response.clone().text()).includes(needle)) {
            cacheMatches.push(`${cacheName}:${request.url}`);
          }
        }
      }
    }
    return {
      local: storageMatches(localStorage),
      session: storageMatches(sessionStorage),
      indexed: indexedMatches,
      cache: cacheMatches,
    };
  }, sentinel);
}

test("R03 keeps Live Operations memory-only and request budget settles without polling", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === `${overview}/sessions`) {
        return {
          body: {
            items: [
              sessionItem({
                vehicle: {
                  ...sessionItem().vehicle,
                  plateNumberNormalized: null,
                  temporaryDescriptor: sentinel,
                },
              }),
            ],
            nextCursor: null,
          },
        };
      }
      if (path === `${overview}/session-state-counts`) {
        return { body: stateCounts() };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByText(sentinel, { exact: true })).toBeVisible();

  const sessionsPath = `${overview}/sessions`;
  const countsPath = `${overview}/session-state-counts`;
  await expect.poll(() => fixture.count(sessionsPath)).toBeGreaterThan(0);
  await expect.poll(() => fixture.count(countsPath)).toBeGreaterThan(0);
  const settled = {
    sessions: fixture.count(sessionsPath),
    counts: fixture.count(countsPath),
  };
  await page.waitForTimeout(750);
  expect(fixture.count(sessionsPath)).toBe(settled.sessions);
  expect(fixture.count(countsPath)).toBe(settled.counts);
  expect(fixture.count(`${overview}/retrieval-queue`)).toBe(0);
  expect(fixture.count(`${overview}/tasks`)).toBe(0);

  const storage = await persistentMatches(page);
  expect(storage.local).toEqual([]);
  expect(storage.session).toEqual([]);
  expect(storage.indexed).toEqual([]);
  expect(storage.cache).toEqual([]);
});
