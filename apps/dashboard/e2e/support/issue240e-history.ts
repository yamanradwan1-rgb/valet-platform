import { expect, type Page } from "@playwright/test";
import { LOCATION_A, ORG_A } from "./dashboard-api-fixture";
import { signInCompany } from "./staff-directory-ui";
export const historyPath = (organizationId: string = ORG_A.organizationId) =>
  `/v1/staff/management/organizations/${organizationId}/shifts`;
export function historyRow(overrides: Record<string, unknown> = {}) {
  return {
    shiftId: "60000000-0000-4000-8000-000000000001",
    membershipId: "50000000-0000-4000-8000-000000000001",
    identity: {
      firstName: "Maya",
      lastName: "O’Connor",
      email: "maya@example.com",
    },
    currentRole: "VALET_EMPLOYEE",
    location: {
      locationId: LOCATION_A.locationId,
      name: LOCATION_A.name,
      code: LOCATION_A.code,
      timezone: LOCATION_A.timezone,
    },
    status: "ACTIVE",
    startedAt: "2026-10-02T05:00:00.000Z",
    endedAt: null,
    ...overrides,
  };
}
export async function enterHistory(page: Page) {
  await signInCompany(page);
  await page.getByRole("button", { name: "Shifts", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Status", exact: true }),
  ).toBeVisible();
}
export function failure(message = "stale history failure") {
  return {
    status: 503,
    body: { code: "TEMPORARY", message, requestId: "history-fixture" },
  };
}
