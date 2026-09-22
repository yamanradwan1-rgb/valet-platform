import type { Request } from "@playwright/test";

import {
  LOCATION_A,
  ORG_A,
  type FixtureReply,
} from "./dashboard-api-fixture";

export const MD04_IDS = {
  customerA: "88888888-8888-4888-8888-888888888881",
  customerB: "88888888-8888-4888-8888-888888888882",
  vehicleA: "99999999-9999-4999-8999-999999999991",
  vehicleB: "99999999-9999-4999-8999-999999999992",
  sessionA: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  sessionB: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  eventOrg: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
  eventLocation: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
  eventUnknown: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
  eventMalicious: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4",
} as const;

export const FULL_PHONE = "+962791234567";
export const MASKED_ENDING = "4567";
export const MALICIOUS_SETTING = "<img src=x onerror=alert(1)>";

export const INACTIVE_LOCATION = {
  ...LOCATION_A,
  locationId: "77777777-7777-4777-8777-777777777771",
  name: "Historic Garage",
  code: "HIST",
  status: "INACTIVE" as const,
};

export type Md04Role = "CA" | "LM" | "SUPERVISOR";

export function md04FeatureAuthority(
  request: Request,
  role: Md04Role,
): FixtureReply {
  const url = new URL(request.url());
  const feature = url.searchParams.get("feature");
  const organizationId = url.searchParams.get("organizationId") ?? ORG_A.organizationId;
  const locationId = url.searchParams.get("locationId");
  if (feature === "VISIT_CONTACTS" && role === "CA" && locationId === null) {
    return { body: { feature, organizationId, role: "ORG_ADMIN", scope: { kind: "ORGANIZATION" } } };
  }
  if (feature === "VISIT_CONTACTS" && role === "LM" && locationId === null) {
    return { body: { feature, organizationId, role: "LOCATION_MANAGER", scope: { kind: "ORGANIZATION_GRANT_SET" } } };
  }
  if (feature === "MANAGEMENT_AUDIT" && role === "CA") {
    return { body: {
      feature, organizationId, role: "ORG_ADMIN",
      scope: locationId === null
        ? { kind: "ORGANIZATION" }
        : { kind: "LOCATION", locationId },
    } };
  }
  if (feature === "MANAGEMENT_AUDIT" && role === "LM" && locationId !== null) {
    return { body: { feature, organizationId, role: "LOCATION_MANAGER", scope: { kind: "LOCATION", locationId } } };
  }
  if (feature === "MANAGEMENT_AUDIT" && role === "SUPERVISOR" && locationId !== null) {
    return { body: { feature, organizationId, role: "VALET_SUPERVISOR", scope: { kind: "LOCATION", locationId } } };
  }
  return errorReply(404, "AUTHORIZATION_DENIED");
}

export function visitSearchReply(request: Request, viewer: "CA" | "LM"): FixtureReply {
  const url = new URL(request.url());
  const cursor = url.searchParams.get("cursor");
  const name = url.searchParams.get("name");
  const phone = url.searchParams.get("phone");
  const plate = url.searchParams.get("plate");
  if (name === "None") return { body: searchBody("NAME", "NONE", [], null) };
  if (name === "Page") {
    return cursor === null
      ? { body: searchBody("NAME", "AMBIGUOUS", [customer("Page One", viewer)], "nextpage1") }
      : { body: searchBody("NAME", "AMBIGUOUS", [customer("Page Two", viewer, MD04_IDS.customerB)], null) };
  }
  if (name === "Correction") {
    return { body: searchBody("NAME", "UNIQUE", [customer("Correction Contact", viewer)], null) };
  }
  if (name) {
    return { body: searchBody("NAME", "AMBIGUOUS", [
      customer("Alex One", viewer), customer("Alex Two", viewer, MD04_IDS.customerB),
    ], null) };
  }
  if (phone) {
    return { body: searchBody("PHONE", "AMBIGUOUS", [
      customer("Phone One", viewer), customer("Phone Two", viewer, MD04_IDS.customerB),
    ], null) };
  }
  if (plate) {
    return { body: searchBody("PLATE", "UNIQUE", [vehicle()], null) };
  }
  return errorReply(400, "VALIDATION_ERROR");
}

export function customer(
  displayName: string,
  viewer: "CA" | "LM",
  customerId = MD04_IDS.customerA,
  updatedAt = "2026-09-22T10:00:00.000Z",
) {
  return {
    associatedVehicles: [{
      plateCountry: "JO", plateNumberRaw: "10-12345", vehicleId: MD04_IDS.vehicleA,
    }],
    completedVisitCount: 3,
    customerId,
    customerUpdatedAt: updatedAt,
    displayName,
    kind: "CUSTOMER" as const,
    latestVisit: {
      createdAt: "2026-09-21T09:00:00.000Z",
      locationId: LOCATION_A.locationId,
      locationName: LOCATION_A.name,
      valetSessionId: MD04_IDS.sessionA,
    },
    phone: viewer === "CA"
      ? { kind: "FULL" as const, value: FULL_PHONE }
      : { kind: "MASKED" as const, ending: MASKED_ENDING },
  };
}

export function vehicle() {
  return {
    completedVisitCount: 2,
    kind: "VEHICLE" as const,
    latestVisit: null,
    plateCountry: "JO",
    plateNumberRaw: "10-12345",
    vehicleId: MD04_IDS.vehicleA,
    vehicleUpdatedAt: "2026-09-22T09:00:00.000Z",
  };
}

export function historyReply(request: Request, viewer: "CA" | "LM", vehicleHistory = false): FixtureReply {
  const cursor = new URL(request.url()).searchParams.get("cursor");
  const item = {
    completedAt: vehicleHistory ? null : "2026-09-21T10:00:00.000Z",
    createdAt: "2026-09-21T09:00:00.000Z",
    customerId: vehicleHistory ? null : MD04_IDS.customerA,
    displayName: vehicleHistory ? null : "Alex One",
    locationId: LOCATION_A.locationId,
    locationName: LOCATION_A.name,
    phone: vehicleHistory ? null : viewer === "CA"
      ? { kind: "FULL" as const, value: FULL_PHONE }
      : { kind: "MASKED" as const, ending: MASKED_ENDING },
    plateCountry: "JO",
    plateNumberRaw: cursor ? "20-54321" : "10-12345",
    returningContact: !vehicleHistory,
    state: vehicleHistory ? "PARKED" as const : "COMPLETED" as const,
    valetSessionId: cursor ? MD04_IDS.sessionB : MD04_IDS.sessionA,
    vehicleId: vehicleHistory ? MD04_IDS.vehicleA : (cursor ? MD04_IDS.vehicleB : MD04_IDS.vehicleA),
  };
  return { body: { items: [item], nextCursor: cursor ? null : "histnext1" } };
}

function searchBody(mode: "NAME" | "PHONE" | "PLATE", matchState: "NONE" | "UNIQUE" | "AMBIGUOUS", items: readonly unknown[], nextCursor: string | null) {
  return { items, matchState, mode, nextCursor };
}

export function errorReply(status: number, code: string): FixtureReply {
  return { status, body: { code, message: code, requestId: `md04-${status}` } };
}

export const visitSearchPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/visit-contacts`;
export const customerHistoryPath = `${visitSearchPath}/${MD04_IDS.customerA}/visits`;
export const vehicleHistoryPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/visit-vehicles/${MD04_IDS.vehicleA}/visits`;
export const nameCorrectionPath = `${visitSearchPath}/${MD04_IDS.customerA}/name-correction`;
export const phoneCorrectionPath = `${visitSearchPath}/${MD04_IDS.customerA}/phone-correction`;
export const orgAuditPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/audit-events`;
export const locationAuditPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/locations/${LOCATION_A.locationId}/audit-events`;
export const inactiveAuditPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/locations/${INACTIVE_LOCATION.locationId}/audit-events`;
