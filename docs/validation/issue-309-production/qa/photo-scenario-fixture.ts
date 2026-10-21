import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page, Route } from "@playwright/test";
import {
  DashboardApiFixture,
  E2E_IDS,
  LOCATION_A,
  ORG_A,
} from "../../../../apps/dashboard/e2e/support/dashboard-api-fixture";
import { signInOnCurrentPage } from "../../../../apps/dashboard/e2e/support/foundation-ui";
import {
  operationsReadReply,
  OP_IDS,
  sessionItem,
} from "../../../../apps/dashboard/e2e/support/operations-fixtures";

export const photoBase = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/sessions/${OP_IDS.session}/condition-photos`;
const overview = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview`;
const jpeg = readFileSync(resolve(__dirname, "synthetic-photo.jpg"));
export type PhotoScenario = "three" | "one" | "ten" | "empty" | "legacy" | "unavailable" | "loading" | "network" | "denied" | "viewer";
export const photoScenarios: PhotoScenario[] = ["three", "one", "ten", "empty", "legacy", "unavailable", "loading", "network", "denied", "viewer"];
export const photoIds = Array.from({ length: 10 }, (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-${(i + 1).toString().padStart(12, "0")}`);

export function initialPhotoCount(scenario: PhotoScenario): number {
  if (scenario === "one") return 1;
  if (scenario === "ten") return 10;
  if (scenario === "three" || scenario === "viewer") return 3;
  return 0;
}

export function installPhotoScenario(page: Page, scenario: PhotoScenario) {
  let retryAuthorizedByTest = false;
  let releasePendingLoading: (() => void) | undefined;
  const loadingGate = new Promise<void>((resolve) => { releasePendingLoading = resolve; });
  const count = initialPhotoCount(scenario);
  const assignee = {
    membershipId: E2E_IDS.membership,
    identity: { firstName: "Lina", lastName: "Haddad", email: "lina@example.com" },
  };
  const item = sessionItem({
    activeTask: { taskId: OP_IDS.task, assignee },
    keySlot: { resourceId: OP_IDS.keySlot, code: "K-12", label: null },
    parkingZone: { resourceId: OP_IDS.point, code: "Z-1", label: "Garage" },
    parkingSpot: { resourceId: OP_IDS.area, code: "P-4", label: "North" },
    vehicle: {
      vehicleId: OP_IDS.vehicle, make: "Toyota", model: "Camry", color: "Black",
      plateCountry: "JO", plateNumberNormalized: "12-34567", temporaryDescriptor: null,
    },
  });
  const live = {
    ...item, checkedInBy: { firstName: "Carmen", lastName: "Original" },
    parkedBy: { firstName: "Nora", lastName: "Parker" }, parkingCompletionProof: "PROVEN",
  };
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: async (path) => {
      if (path === `${overview}/sessions`) return { body: { items: [item], nextCursor: null } };
      if (path === `${overview}/live-sessions`) return { body: { items: [live], nextCursor: null } };
      if (path === photoBase) {
        if (scenario === "loading") await loadingGate;
        if (scenario === "denied") return { status: 403, body: { code: "AUTHORIZATION_DENIED" } };
        if (scenario === "unavailable") return { status: 410, body: { code: "IMAGE_UNAVAILABLE" } };
        if (scenario === "network" && !retryAuthorizedByTest) return { status: 500, body: { code: "UPSTREAM_FAILURE" } };
        // Empty also represents legitimate legacy metadata-only evidence: the
        // server must exclude metadata-only rows from the verified manifest.
        return {
          body: { items: photoIds.slice(0, scenario === "network" ? 1 : count).map((photoId) => ({
            photoId, contentType: "image/jpeg", verifiedAt: "2026-09-21T12:00:00Z",
          })) },
        };
      }
      return operationsReadReply(path);
    },
  });
  const setup = async () => {
    await fixture.install(page);
    // Later Playwright routes take precedence. Binary bytes bypass the older
    // JSON-only fixture response handler and never contact production API.
    await page.route("**/condition-photos/*/bytes", async (route: Route) => {
      if (!route.request().url().includes(photoBase)) {
        await route.abort();
        return;
      }
      await route.fulfill({ status: 200, contentType: "image/jpeg", body: jpeg,
        headers: { "cache-control": "no-store" } });
    });
  };
  return { fixture, setup, releaseLoading: () => releasePendingLoading?.(), permitNetworkRetry: () => { retryAuthorizedByTest = true; } };
}

export async function openPhotos(page: Page, surface: "vehicles" | "live-operations") {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${surface}`);
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await page.getByRole("table").getByText("Toyota Camry", { exact: true }).waitFor();
  await page.getByRole("table").getByRole("button", { name: /Details|التفاصيل/u }).first().click();
}
