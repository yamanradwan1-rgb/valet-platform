import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementAuditTestFixture } from "./management-audit-test-fixture";

const fixture = new ManagementAuditTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function locationPath(organizationId: string, locationId: string): string {
  return `/v1/staff/management/organizations/${organizationId}/locations/${locationId}/audit-events?limit=100`;
}

describe("MGT-BE-06 Supervisor audit visibility", () => {
  it("returns only the operational allowlist and filters privileged/non-operational families", async () => {
    const user = await fixture.createUser();
    const organizationId = await fixture.createOrganization({
      name: "Supervisor audit visibility",
    });
    const membershipId = await fixture.addMembership(
      organizationId,
      user.id,
      "VALET_SUPERVISOR",
    );
    const location = await fixture.addLocation(organizationId);
    await fixture.grantLocationAccess(
      organizationId,
      membershipId,
      location.locationId,
    );
    await fixture.startActiveShift(
      organizationId,
      location.locationId,
      membershipId,
    );
    const auth = await fixture.nativeLogin(user);

    const allowedTypes = [
      "VALET_SESSION_CREATED",
      "VEHICLE_DETAILS_CORRECTED",
      "GUEST_ACCESS_ISSUED",
      "VALET_SESSION_KEY_SLOT_ASSIGNED",
      "TASK_ASSIGNED",
      "VALET_SESSION_PARKING_STARTED",
      "RETRIEVAL_REQUESTED",
      "VALET_SESSION_HANDOFF_INITIATED",
      "HANDOFF_VERIFIED",
      "VALET_SESSION_COMPLETED",
    ] as const;
    const excludedTypes = [
      "SHIFT_STARTED",
      "INCIDENT_OPENED",
      "PAYMENT_INITIALIZED",
      "MAP_SETUP_POINT_CREATED",
      "LOCATION_CONFIGURATION_OVERRIDE_SET",
      "DASHBOARD_LOCATION_BRANDING_OVERRIDE_CHANGED",
      "DASHBOARD_REPORT_EXPORT_GENERATED",
      "STAFF_ACCOUNT_PROVISIONED",
      "STAFF_ROLE_CHANGED",
      "MANAGEMENT_LOCATION_SETTING_OVERRIDE_CHANGED",
      "FUTURE_PRIVATE_AUDIT_EVENT",
    ] as const;

    const allowedIds: string[] = [];
    for (const eventType of allowedTypes) {
      allowedIds.push(
        await fixture.insertAuditEvent({
          actorMembershipId: membershipId,
          eventType,
          locationId: location.locationId,
          metadata: {},
          organizationId,
        }),
      );
    }
    const excludedIds: string[] = [];
    for (const eventType of excludedTypes) {
      excludedIds.push(
        await fixture.insertAuditEvent({
          actorMembershipId: membershipId,
          eventType,
          locationId: location.locationId,
          metadata: { private: "must-not-surface" },
          organizationId,
        }),
      );
    }

    const result = await fixture.managementGet(
      locationPath(organizationId, location.locationId),
      auth.accessToken,
    );
    expect(result.status).toBe(200);
    const items = result.body?.items as Array<{
      details: { kind: string };
      eventId: string;
      eventType: string;
    }>;
    expect(new Set(items.map((item) => item.eventId))).toEqual(
      new Set(allowedIds),
    );
    expect(new Set(items.map((item) => item.eventType))).toEqual(
      new Set(allowedTypes),
    );
    expect(items.map((item) => item.details.kind)).toEqual(
      expect.arrayContaining(["CHECK_IN", "KEY", "TASK", "SESSION"]),
    );
    for (const eventId of excludedIds) {
      expect(items.some((item) => item.eventId === eventId)).toBe(false);
    }
    expect(JSON.stringify(items)).not.toContain("must-not-surface");
    expect(JSON.stringify(items)).not.toContain("FUTURE_PRIVATE_AUDIT_EVENT");
  });
});
