import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { Issue232PhysicalState } from "./support/issue232-physical-resources";
import {
  enterPhysicalResources,
  openPhysicalResources,
  selectCompanyLocationAfterReload,
} from "./support/keys-spots";
import { decodeQrFromPng } from "./support/png-qr-decode";

function fixture(state: Issue232PhysicalState) {
  return new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => state.reply(path, request),
  });
}

async function enter(page: Page, state: Issue232PhysicalState) {
  await fixture(state).install(page);
  await enterPhysicalResources(page);
}

test("lists real resources, creates persisted rows, refreshes and reopens labels", async ({
  page,
}) => {
  const state = new Issue232PhysicalState(true);
  await enter(page, state);
  await expect(page.locator('[data-resource-code="K-01"]')).toBeVisible();
  await page.getByRole("button", { name: "Add Key Slot" }).click();
  const keyDialog = page.getByRole("dialog", { name: "Add Key Slot" });
  await keyDialog.getByLabel("Resource code").fill(" K-02 ");
  await keyDialog
    .getByRole("button", { name: "Add Key Slot", exact: true })
    .dblclick();
  expect(state.keyPostBodies).toHaveLength(1);
  const label = page.getByRole("dialog", { name: "Physical resource label" });
  await expect(label.getByText("K-02", { exact: true })).toBeVisible();
  await label.getByRole("button", { name: "Close", exact: true }).last().click();
  await page.reload();
  await selectCompanyLocationAfterReload(page);
  await expect(page.locator('[data-resource-code="K-02"]')).toBeVisible();

  await page.getByRole("group", { name: "Resource family" }).getByRole("button", { name: /Parking Spots/u }).click();
  await expect(page.locator('[data-resource-code="P-01"]')).toBeVisible();
  await page.getByRole("button", { name: "Add Parking Spot" }).click();
  const spotDialog = page.getByRole("dialog", { name: "Add Parking Spot" });
  await spotDialog.getByLabel("Code").fill("P-02");
  await spotDialog.getByLabel("Label").fill("Front Row 02");
  await spotDialog
    .getByLabel("Parking Zone")
    .selectOption("33333333-3333-4333-8333-333333333333");
  await spotDialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Physical resource label" })
      .getByText("P-02", { exact: true }),
  ).toBeVisible();
  expect(state.spotPostBodies).toHaveLength(1);
});

test("empty states, duplicate validation and 401 reconciliation never auto-replay POST", async ({
  page,
}) => {
  const state = new Issue232PhysicalState(false);
  const api = fixture(state);
  await api.install(page);
  await enterPhysicalResources(page);
  await expect(page.getByRole("region", { name: "Resource list" }).getByText("No resources in this view.")).toBeVisible();
  state.failNextKeyPost401 = true;
  const keyPath = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/physical-resources/key-slots`;
  const readsBefore = api.count(keyPath);
  await page.getByRole("button", { name: "Add Key Slot" }).click();
  const dialog = page.getByRole("dialog", { name: "Add Key Slot" });
  await dialog.getByLabel("Resource code").fill("K-09");
  await dialog.getByRole("button", { name: "Add Key Slot", exact: true }).click();
  expect(state.keyPostBodies).toHaveLength(1);
  await expect(page.getByRole("dialog", { name: "Add Key Slot" })).toHaveCount(
    0,
  );
  expect(api.count(keyPath)).toBeGreaterThan(readsBefore);
  await openPhysicalResources(page);
  await page.getByRole("button", { name: "Add Key Slot" }).click();
  const retryDialog = page.getByRole("dialog", { name: "Add Key Slot" });
  await retryDialog.getByLabel("Code").fill("K-09");
  await retryDialog
    .getByRole("button", { name: "Add Key Slot", exact: true })
    .click();
  expect(state.keyPostBodies).toHaveLength(2);
  expect((state.keyPostBodies[0] as { operationId: string }).operationId).toBe(
    (state.keyPostBodies[1] as { operationId: string }).operationId,
  );
});

test("announces duplicate conflicts and restores keyboard focus", async ({
  page,
}) => {
  const state = new Issue232PhysicalState(true);
  await enter(page, state);
  const add = page.getByRole("button", { name: "Add Key Slot" });
  await add.focus();
  await add.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Add Key Slot" });
  const code = dialog.getByLabel("Resource code");
  await expect(code).toBeFocused();
  await code.fill("K-01");
  await dialog.getByRole("button", { name: "Add Key Slot", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(add).toBeFocused();
});

test("downloads a real high-resolution PNG and print mode excludes Dashboard chrome", async ({
  page,
}) => {
  const state = new Issue232PhysicalState(true);
  await enter(page, state);
  await page.getByRole("button", { name: "View QR label" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Physical resource label" });
  await expect(dialog.getByText("KEY SLOT", { exact: true })).toBeVisible();
  await expect(
    dialog.locator(".issue304-modal-label-resource"),
  ).toContainText(LOCATION_A.name);
  await page.evaluate(() => {
    const originalCreate = URL.createObjectURL.bind(URL);
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    (
      window as unknown as {
        issue232ObjectUrls: { created: number; revoked: number };
      }
    ).issue232ObjectUrls = { created: 0, revoked: 0 };
    URL.createObjectURL = (blob) => {
      (
        window as unknown as {
          issue232ObjectUrls: { created: number; revoked: number };
        }
      ).issue232ObjectUrls.created += 1;
      return originalCreate(blob);
    };
    URL.revokeObjectURL = (url) => {
      (
        window as unknown as {
          issue232ObjectUrls: { created: number; revoked: number };
        }
      ).issue232ObjectUrls.revoked += 1;
      originalRevoke(url);
    };
  });
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download QR" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = readFileSync(path!);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(1500);
  expect(decodeQrFromPng(bytes)).toBe(
    `vaylet:v2:key-slot:11111111-1111-4111-8111-111111111111:K-01`,
  );
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            issue232ObjectUrls: { created: number; revoked: number };
          }
        ).issue232ObjectUrls,
    ),
  ).toEqual({ created: 1, revoked: 1 });
  const stored = await page.evaluate(async () => {
    const result: unknown[] = [];
    result.push([
      ...Array.from({ length: localStorage.length }, (_, index) =>
        localStorage.key(index),
      )
        .filter(Boolean)
        .map((key) => [key, localStorage.getItem(key!)]),
    ]);
    result.push([
      ...Array.from({ length: sessionStorage.length }, (_, index) =>
        sessionStorage.key(index),
      )
        .filter(Boolean)
        .map((key) => [key, sessionStorage.getItem(key!)]),
    ]);
    if (typeof indexedDB.databases === "function") {
      for (const info of await indexedDB.databases()) {
        if (!info.name) continue;
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(info.name!);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        for (const storeName of Array.from(db.objectStoreNames)) {
          const values = await new Promise<unknown[]>((resolve, reject) => {
            const request = db
              .transaction(storeName)
              .objectStore(storeName)
              .getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          result.push([info.name, storeName, values]);
        }
        db.close();
      }
    }
    if ("caches" in window) {
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const response = await cache.match(request);
          result.push([
            name,
            request.url,
            response ? await response.clone().text() : null,
          ]);
        }
      }
    }
    return JSON.stringify(result);
  });
  expect(stored).not.toContain("vaylet:v2:key-slot");
  // This fixture's key-slot ID equals ORG_A's ID, which is legitimately stored
  // for workspace restoration. Check actual resource/QR data rather than the
  // ambiguous UUID value shared with the authorized Organization.
  expect(stored).not.toContain('"keySlotId"');
  expect(stored).not.toContain("K-01");

  await page.emulateMedia({ media: "print" });
  const printLabel = page.getByTestId("physical-resource-print-label");
  await expect(printLabel).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Management navigation" }),
  ).toBeHidden();
  await expect(
    dialog.getByRole("button", { name: "Download QR" }),
  ).toBeHidden();
  await page.emulateMedia({ media: "screen" });
});
