import { expect, type Page } from "@playwright/test";
import { staffDirectoryItem } from "./administration-fixtures";
import {
  DashboardApiFixture,
  E2E_IDS,
  LOCATION_A,
  ORG_A,
} from "./dashboard-api-fixture";
import { signInOnCurrentPage } from "./foundation-ui";

// Synthetic credentials only. Assertions report presence booleans, never values.
export const TEST_INVITE = `vsi1.${"d".repeat(43)}`;
export const TEST_LINK = `http://localhost:3003/staff/activate#invite=${TEST_INVITE}`;
export const STAFF_BASE = `/v1/staff/management/organizations/${ORG_A.organizationId}/staff`;
export const PENDING_STAFF = {
  ...staffDirectoryItem(),
  status: "PENDING",
  locationAccessCount: 1,
  identity: {
    firstName: "ليلى",
    lastName: "Smith",
    email: "pending@example.test",
  },
} as const;
export const PENDING_DETAIL = {
  ...PENDING_STAFF,
  locationAccess: {
    items: [
      {
        locationId: LOCATION_A.locationId,
        name: LOCATION_A.name,
        status: LOCATION_A.status,
      },
    ],
    totalCount: 1,
    truncated: false,
  },
  pendingInvitation: {
    generation: 1,
    expiresAt: "2026-10-03T08:00:00.000Z",
    state: "CURRENT",
  },
};
export function inviteResult(fresh = true, generation = 1) {
  return {
    outcome: fresh ? "INVITE_ISSUED" : "INVITE_PENDING_LINK_UNAVAILABLE",
    membershipId: E2E_IDS.membership,
    invitationId: E2E_IDS.factor,
    generation,
    expiresAt: "2026-10-03T08:00:00.000Z",
    ...(fresh ? { activationLink: TEST_LINK } : {}),
  };
}
export async function openEmployees(
  page: Page,
  fixture: DashboardApiFixture,
  manager = false,
) {
  await fixture.install(page);
  await page.goto("/employees");
  await signInOnCurrentPage(page, manager ? "manager@example.com" : undefined);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  if (manager)
    await page.getByRole("button", { name: "Employees", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
}
export async function fillCreate(page: Page) {
  const dialog = page.getByRole("dialog", {
    name: "Create Employee",
    exact: true,
  });
  await dialog.getByLabel("First name").fill("ليلى");
  await dialog.getByLabel("Last name").fill("Smith");
  await dialog.getByLabel("Email").fill("pending@example.test");
  await dialog.getByRole("checkbox").first().check();
  return dialog;
}
export async function browserSecretPresent(page: Page, secret = TEST_INVITE) {
  return page.evaluate(async (credential) => {
    const values = [
      location.href,
      document.documentElement.outerHTML,
      document.cookie,
      JSON.stringify(localStorage),
      JSON.stringify(sessionStorage),
      ...performance.getEntriesByType("resource").map((entry) => entry.name),
    ];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        values.push(
          request.url,
          await (await cache.match(request))!.clone().text(),
        );
      }
    }
    for (const info of await indexedDB.databases()) {
      if (!info.name) continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(info.name!);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(new Error("IndexedDB inspection failed"));
      });
      for (const store of db.objectStoreNames) {
        const records = await new Promise<unknown>((resolve, reject) => {
          const request = db.transaction(store).objectStore(store).getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(new Error("Store inspection failed"));
        });
        values.push(JSON.stringify(records));
      }
      db.close();
    }
    return values.some((value) => value.includes(credential));
  }, secret);
}

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
export async function switchOrganization(
  page: Page,
  organization: typeof ORG_A,
  location: typeof LOCATION_A,
) {
  await page
    .locator(".sidebar-scope")
    .evaluate((button: HTMLButtonElement) => button.click());
  await page
    .getByRole("button", { name: organization.name, exact: true })
    .click();
  await page.getByRole("button", { name: location.name, exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
}
