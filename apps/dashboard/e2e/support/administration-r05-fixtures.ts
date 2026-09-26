import { E2E_IDS, LOCATION_A } from "./dashboard-api-fixture";

export const STAFF_EMAIL = "worker@example.com";
export const STAFF_EMAIL_2 = "manager.r05@example.com";
export const STAFF_MEMBERSHIP_2 = "88888888-8888-4888-8888-888888888888";
export const SHIFT_ID_2 = "99999999-9999-4999-8999-999999999999";

export const staffPath = (organizationId: string) =>
  `/v1/staff/management/organizations/${organizationId}/staff`;
export const activeShiftsPath = (locationId: string) =>
  `/v1/staff/dashboard/locations/${locationId}/overview/active-shifts`;

export function staffItem(overrides: Record<string, unknown> = {}) {
  return {
    identity: { email: STAFF_EMAIL },
    locationAccessCount: 2,
    membershipId: E2E_IDS.membership,
    role: "VALET_EMPLOYEE",
    status: "ACTIVE",
    version: 1,
    ...overrides,
  };
}

export function staffDetail(overrides: Record<string, unknown> = {}) {
  return {
    ...staffItem(),
    locationAccess: {
      items: [{
        locationId: LOCATION_A.locationId,
        name: LOCATION_A.name,
        status: LOCATION_A.status,
      }],
      totalCount: 1,
      truncated: false,
    },
    ...overrides,
  };
}

export function activeShift(overrides: Record<string, unknown> = {}) {
  return {
    membershipId: E2E_IDS.membership,
    shiftId: E2E_IDS.shift,
    startedAt: "2026-09-21T07:00:00.000Z",
    ...overrides,
  };
}
