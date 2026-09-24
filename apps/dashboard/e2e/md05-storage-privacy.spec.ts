import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { applyAnalyticsPeriod } from "./support/md05-analytics-fixtures";
import {
  companyAnalytics,
  companyAnalyticsPath,
  financialCurrency,
  locationIntelligenceReply,
  locationPaths,
  PERIOD_A,
} from "./support/md05-intelligence-fixtures";
import {
  companyReportReply,
  locationReportReply,
  REPORT_SELECTORS,
} from "./support/md05-reports-fixtures";
import {
  expectArtifact,
  expectObjectUrlRevoked,
  installBinary,
  installObjectUrlRevokeProbe,
  loadReport,
} from "./support/md05-reports-e2e-helpers";

const MARKER = 987654321;
const SENTINEL = `${MARKER}.000`;
const ARTIFACT_SENTINEL = "DURATION,CheckInTime,sampleCount,,2";

async function applyPeriod(page: Page) {
  await page.locator('[data-testid^="md05-"][data-testid$="-page"] button[aria-haspopup="dialog"]').click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("From").fill(PERIOD_A.from);
  await dialog.getByLabel("To").fill(PERIOD_A.to);
  await dialog.getByRole("button", { name: "Apply" }).click();
}

async function persistentState(page: Page, sentinel: string) {
  return await page.evaluate(async (needle) => {
    const matches = (storage: Storage) => Object.entries(storage)
      .filter(([, value]) => value.includes(needle))
      .map(([key]) => key);
    const databaseInfo = typeof indexedDB.databases === "function"
      ? await indexedDB.databases()
      : [];
    const databases = databaseInfo.map((db) => `${db.name ?? ""}:${db.version ?? ""}`).sort();
    const indexedMatches: string[] = [];
    const searchable = async (value: unknown) => {
      if (typeof value === "string") return value;
      if (value instanceof Blob) return await value.text();
      if (value instanceof ArrayBuffer) return new TextDecoder().decode(value);
      if (ArrayBuffer.isView(value)) {
        return new TextDecoder().decode(
          new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
        );
      }
      try { return JSON.stringify(value) ?? ""; } catch { return String(value); }
    };
    for (const info of databaseInfo) {
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
            if ((await searchable(value)).includes(needle)) {
              indexedMatches.push(`${info.name}:${storeName}`);
            }
          }
        }
      } finally {
        database.close();
      }
    }
    const cacheEntries: string[] = [];
    const cacheMatches: string[] = [];
    if ("caches" in window) {
      for (const cacheName of await caches.keys()) {
        const cache = await caches.open(cacheName);
        for (const request of await cache.keys()) {
          cacheEntries.push(`${cacheName}:${request.url}`);
          const response = await cache.match(request);
          if (response && (await response.clone().text()).includes(needle)) {
            cacheMatches.push(`${cacheName}:${request.url}`);
          }
        }
      }
    }
    return {
      localMatches: matches(localStorage),
      sessionMatches: matches(sessionStorage),
      indexedDbEnumeration: typeof indexedDB.databases === "function",
      databases,
      indexedMatches,
      cacheEntries: cacheEntries.sort(),
      cacheMatches,
    };
  }, sentinel);
}

for (const scope of ["COMPANY", "LOCATION"] as const) {
  test(`${scope} MD-05 business data and export artifacts are not persistently stored`, async ({ page }) => {
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (path, request) => {
        if (scope === "COMPANY" && path === companyAnalyticsPath) {
          return { body: companyAnalytics(request, MARKER, [financialCurrency("JOD", SENTINEL)]) };
        }
        if (scope === "LOCATION") {
          const intelligence = locationIntelligenceReply(path, request, MARKER);
          if (intelligence) return intelligence;
          const report = locationReportReply(path, request, MARKER);
          if (report) return report;
        }
        return companyReportReply(path, request, MARKER);
      },
    });
    await installObjectUrlRevokeProbe(page);
    await fixture.install(page);
    const binary = await installBinary(page, () => ({
      kind: "artifact",
      format: "CSV",
      company: scope === "COMPANY",
    }));

    await page.goto("/overview");
    await signInOnCurrentPage(page);
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page.getByRole("button", {
      name: scope === "COMPANY" ? "All Locations" : LOCATION_A.name,
    }).click();
    const baseline = await persistentState(page, SENTINEL);

    await applyPeriod(page);
    await expect(page.getByText(String(MARKER), { exact: true }).first()).toBeVisible();
    await page.getByRole("navigation", { name: "Management navigation" })
      .getByRole("link", { name: "Payments" }).click();
    await expect(page.getByTestId("md05-payments-page")).toBeVisible();
    if (scope === "LOCATION") {
      await expect.poll(() => fixture.count(locationPaths.financialOverview)).toBeGreaterThan(0);
    }
    await applyPeriod(page);
    await expect(page.getByText(`${SENTINEL} JOD`, { exact: true }).first()).toBeVisible();
    await page.getByRole("navigation", { name: "Management navigation" })
      .getByRole("link", { name: "Analytics" }).click();
    await expect(page.getByTestId("md05-analytics-page")).toBeVisible();
    await applyAnalyticsPeriod(page);
    const evidence = page.getByTestId("analytics-source-evidence");
    await evidence.locator("summary").click();
    await expect(evidence.getByText(`${SENTINEL} JOD`, { exact: true })).toBeVisible();
    await page.getByRole("navigation", { name: "Management navigation" })
      .getByRole("link", { name: "Reports" }).click();
    const dialog = await loadReport(page, "DAILY");
    await expect(dialog.getByText(SENTINEL, { exact: true }).first()).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await dialog.getByRole("button", { name: /Export CSV/u }).click();
    const prefix = scope === "COMPANY" ? "company-report" : "report";
    await expectArtifact(
      await downloadPromise,
      "CSV",
      `${prefix}-daily-${REPORT_SELECTORS.daily}.csv`,
    );
    const objectUrls = await expectObjectUrlRevoked(page);

    const after = await persistentState(page, SENTINEL);
    expect(after.localMatches).toEqual([]);
    expect(after.sessionMatches).toEqual([]);
    expect(after.indexedDbEnumeration).toBe(true);
    expect(after.indexedMatches).toEqual([]);
    expect(after.cacheMatches).toEqual([]);
    expect(after.databases).toEqual(baseline.databases);
    expect(after.cacheEntries).toEqual(baseline.cacheEntries);
    const artifactState = await persistentState(page, ARTIFACT_SENTINEL);
    expect(artifactState.localMatches).toEqual([]);
    expect(artifactState.sessionMatches).toEqual([]);
    expect(artifactState.indexedMatches).toEqual([]);
    expect(artifactState.cacheMatches).toEqual([]);
    for (const objectUrl of objectUrls) {
      const objectUrlState = await persistentState(page, objectUrl);
      expect(objectUrlState.localMatches).toEqual([]);
      expect(objectUrlState.sessionMatches).toEqual([]);
      expect(objectUrlState.indexedMatches).toEqual([]);
      expect(objectUrlState.cacheMatches).toEqual([]);
    }
    expect(binary.posts).toBe(1);
  });
}
