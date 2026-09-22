import type { Request } from "@playwright/test";

import { E2E_IDS, LOCATION_A, ORG_A, type FixtureReply } from "./dashboard-api-fixture";
import {
  INACTIVE_LOCATION,
  MALICIOUS_SETTING,
  MD04_IDS,
  inactiveAuditPath,
  locationAuditPath,
  orgAuditPath,
} from "./md04-fixtures";

export function md04AuditReply(
  path: string,
  request: Request,
  role: "CA" | "LM" | "SUPERVISOR",
): FixtureReply | undefined {
  const url = new URL(request.url());
  const cursor = url.searchParams.get("cursor");
  const eventType = url.searchParams.get("eventType");
  if (path === orgAuditPath && role === "CA") {
    const first = organizationEvents().filter((event) =>
      eventType === null || event.eventType === eventType);
    return cursor === null
      ? { body: { items: first, nextCursor: eventType ? null : "auditnext1" } }
      : { body: { items: [secondPageEvent()], nextCursor: null } };
  }
  if (path === locationAuditPath) {
    const event = role === "SUPERVISOR"
      ? supervisorEvent(LOCATION_A.locationId)
      : locationEvent(LOCATION_A.locationId);
    return { body: { items: [event], nextCursor: null } };
  }
  if (path === inactiveAuditPath && role === "LM") {
    return { body: { items: [locationEvent(INACTIVE_LOCATION.locationId)], nextCursor: null } };
  }
  return undefined;
}

export function organizationEvents() {
  return [
    {
      actor: { type: "SYSTEM" as const },
      details: { kind: "MANAGEMENT" as const, operation: "SET" as const, settingKey: "photosRequired" },
      entity: { id: ORG_A.organizationId, type: "ORGANIZATION" as const },
      eventId: MD04_IDS.eventOrg,
      eventType: "MANAGEMENT_COMPANY_SETTING_DEFAULT_CHANGED" as const,
      occurredAt: "2026-09-22T08:00:00.000Z",
      scope: { kind: "ORGANIZATION" as const },
    },
    locationEvent(LOCATION_A.locationId),
    {
      actor: { type: "MEMBERSHIP" as const, membershipId: E2E_IDS.membership },
      details: { kind: "CONFIGURATION" as const, operation: "SET" as const, settingKey: MALICIOUS_SETTING },
      entity: { id: LOCATION_A.locationId, type: "LOCATION" as const },
      eventId: MD04_IDS.eventMalicious,
      eventType: "LOCATION_CONFIGURATION_OVERRIDE_SET" as const,
      occurredAt: "2026-09-22T08:02:00.000Z",
      scope: { kind: "LOCATION" as const, locationId: LOCATION_A.locationId },
    },
    {
      details: { kind: "UNKNOWN" as const },
      entity: null,
      eventId: MD04_IDS.eventUnknown,
      eventType: "UNKNOWN" as const,
      occurredAt: "2026-09-22T08:03:00.000Z",
      scope: { kind: "ORGANIZATION" as const },
    },
  ] as const;
}

export function locationEvent(locationId: string) {
  return {
    actor: { type: "MEMBERSHIP" as const, membershipId: E2E_IDS.membership },
    details: { kind: "CONFIGURATION" as const, operation: "SET" as const, settingKey: "operatingHours" },
    entity: { id: locationId, type: "LOCATION" as const },
    eventId: MD04_IDS.eventLocation,
    eventType: "LOCATION_CONFIGURATION_OVERRIDE_SET" as const,
    occurredAt: "2026-09-22T08:01:00.000Z",
    scope: { kind: "LOCATION" as const, locationId },
  };
}

export function supervisorEvent(locationId: string) {
  return {
    actor: { type: "MEMBERSHIP" as const, membershipId: E2E_IDS.membership },
    details: {
      kind: "SESSION" as const,
      fromState: "PARKING" as const,
      toState: "PARKED" as const,
      fromVersion: 1,
      toVersion: 2,
    },
    entity: { id: MD04_IDS.sessionA, type: "VALET_SESSION" as const },
    eventId: MD04_IDS.eventLocation,
    eventType: "VALET_SESSION_PARKED" as const,
    occurredAt: "2026-09-22T08:04:00.000Z",
    scope: { kind: "LOCATION" as const, locationId },
  };
}

export function malformedAuditReply(): FixtureReply {
  return {
    body: {
      items: [{
        ...organizationEvents()[0],
        details: { kind: "FINANCIAL", rawMetadata: { secret: "rawSecret" } },
      }],
      nextCursor: null,
    },
  };
}

function secondPageEvent() {
  return {
    actor: { type: "CONTROLLED_OPERATOR" as const },
    details: { kind: "REPORT" as const },
    entity: null,
    eventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5",
    eventType: "DASHBOARD_REPORT_EXPORT_GENERATED" as const,
    occurredAt: "2026-09-22T08:05:00.000Z",
    scope: { kind: "ORGANIZATION" as const },
  };
}
