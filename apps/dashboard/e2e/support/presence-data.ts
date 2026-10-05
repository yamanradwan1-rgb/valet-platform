import { E2E_IDS } from "./fixture-data";
import type {
  PresenceCompany,
  PresenceLocation,
  PresenceException,
} from "../../src/features/administration/settings/shift-presence-api";
export const ZONE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const EXCEPTION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const lmBase = `/v1/staff/dashboard/locations/${E2E_IDS.locationA}/configuration/shift-presence`;
export const companyBase = `/v1/staff/management/organizations/${E2E_IDS.orgA}/shift-presence`;
export const caBase = `${companyBase}/locations/${E2E_IDS.locationA}`;

export function companyPolicy(): PresenceCompany {
  return {
    organizationId: E2E_IDS.orgA,
    policy: {
      startMode: "OFF",
      endMode: "OFF",
      maxAccuracyMeters: 50,
      maxFixAgeSeconds: 30,
      revision: 1,
    },
    capabilities: { canEdit: true, strictActivationAllowed: false },
  };
}
export function locationPolicy(): PresenceLocation {
  const company = companyPolicy().policy;
  return {
    organizationId: E2E_IDS.orgA,
    locationId: E2E_IDS.locationA,
    timezone: "Asia/Amman",
    company,
    overrides: {
      revision: 1,
      startModeOverride: null,
      endModeOverride: null,
      maxAccuracyMetersOverride: null,
      maxFixAgeSecondsOverride: null,
    },
    effective: {
      startMode: "OFF",
      endMode: "OFF",
      maxAccuracyMeters: 50,
      maxFixAgeSeconds: 30,
    },
    readiness: {
      applicability: "NOT_APPLICABLE",
      configurationUsable: true,
      strictActivationAllowed: false,
      activeZoneCount: 1,
      blockers: [],
      companyRevision: 1,
      locationRevision: 1,
      configurationFingerprint: "a".repeat(64),
      observedAt: "2026-10-05T09:00:00Z",
    },
    capabilities: { canEdit: true, canReviewExceptions: true },
  };
}
export function attendanceZone() {
  return {
    id: ZONE_ID,
    organizationId: E2E_IDS.orgA,
    locationId: E2E_IDS.locationA,
    code: "LOBBY",
    label: "Hotel lobby",
    latitude: 31.95,
    longitude: 35.91,
    radiusMeters: 25.5,
    state: "ACTIVE" as const,
    revision: 1,
  };
}
export function presenceException(): PresenceException {
  return {
    exceptionId: EXCEPTION_ID,
    locationId: E2E_IDS.locationA,
    action: "START",
    shiftId: null,
    reason: "OUTSIDE_ZONE",
    status: "PENDING",
    revision: 1,
    requestedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    reviewedAt: null,
    terminalAt: null,
    requester: {
      userId: E2E_IDS.shift,
      membershipId: E2E_IDS.membership,
      firstName: "Nadia",
      lastName: "Salem",
      email: "nadia@example.com",
    },
    timezone: "Asia/Amman",
    canReview: true,
  };
}
