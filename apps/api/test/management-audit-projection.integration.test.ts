import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementAuditTestFixture } from "./management-audit-test-fixture";

const fixture = new ManagementAuditTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id);
  const location = await fixture.addLocation(membership.organizationId);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, location, membership };
}

function organizationPath(organizationId: string): string {
  return `/v1/staff/management/organizations/${organizationId}/audit-events?limit=100`;
}

describe("MGT-BE-06 audit family projections", () => {
  it("projects one current representative from every inventoried family to an explicit safe shape", async () => {
    const state = await assuredAdmin();
    const occurredAt = new Date("2026-09-08T12:00:00.000Z");
    const familyCases = [
      {
        details: {
          customerPresent: true,
          identityMode: "CONFIRMED_PLATE",
          kind: "CHECK_IN",
        },
        entityType: "ValetSession",
        eventType: "VALET_SESSION_CREATED",
        metadata: {
          customerPresent: true,
          identityMode: "CONFIRMED_PLATE",
          intakeContractVersion: "V2",
        },
      },
      {
        details: { fromVersion: 1, kind: "KEY", toVersion: 2 },
        entityType: "VALET_SESSION",
        eventType: "VALET_SESSION_KEY_SLOT_ASSIGNED",
        metadata: {
          currentKeySlotId: randomUUID(),
          fromVersion: 1,
          previousKeySlotId: null,
          toVersion: 2,
        },
      },
      {
        details: {
          fromStatus: "QUEUED",
          fromVersion: 1,
          kind: "TASK",
          toStatus: "ASSIGNED",
          toVersion: 2,
        },
        entityType: "Task",
        eventType: "TASK_ASSIGNED",
        metadata: {
          fromStatus: "QUEUED",
          fromVersion: 1,
          newAssigneeMembershipId: randomUUID(),
          reason: "private reassignment reason",
          toStatus: "ASSIGNED",
          toVersion: 2,
        },
      },
      {
        details: { kind: "SHIFT", status: "ACTIVE" },
        entityType: "Shift",
        eventType: "SHIFT_STARTED",
        metadata: { status: "ACTIVE" },
      },
      {
        details: {
          fromState: "READY",
          fromVersion: 4,
          handoffMethod: "DYNAMIC_QR",
          kind: "SESSION",
          toState: "HANDOFF_PENDING",
          toVersion: 5,
        },
        entityType: "ValetSession",
        eventType: "VALET_SESSION_HANDOFF_INITIATED",
        metadata: {
          from_state: "READY",
          from_version: 4,
          method: "DYNAMIC_QR",
          task_id: randomUUID(),
          to_state: "HANDOFF_PENDING",
          to_version: 5,
        },
      },
      {
        details: {
          kind: "INCIDENT",
          severity: "HIGH",
          status: "OPEN",
          type: "VEHICLE_DAMAGE",
        },
        entityType: "INCIDENT",
        eventType: "INCIDENT_OPENED",
        metadata: {
          incidentId: randomUUID(),
          severity: "HIGH",
          status: "OPEN",
          type: "VEHICLE_DAMAGE",
        },
      },
      {
        details: { kind: "FINANCIAL" },
        entityType: "Payment",
        eventType: "PAYMENT_INITIALIZED",
        metadata: { amount: "999.000", currency: "JOD", provider: "PRIVATE" },
      },
      {
        details: { kind: "MAP" },
        entityType: "LocationMapPoint",
        eventType: "MAP_SETUP_POINT_CREATED",
        metadata: { latitude: 32.5, longitude: 35.8, vertexJson: [1, 2] },
      },
      {
        details: {
          kind: "CONFIGURATION",
          operation: "SET",
          settingKey: "trackingEnabled",
        },
        entityType: "Location",
        eventType: "LOCATION_CONFIGURATION_OVERRIDE_SET",
        metadata: {
          operation: "SET",
          previousValue: "false",
          settingKey: "trackingEnabled",
          value: "true",
        },
      },
      {
        details: { kind: "REPORT" },
        entityType: "Location",
        eventType: "DASHBOARD_REPORT_EXPORT_GENERATED",
        metadata: {
          contentLength: 1234,
          contentSha256: "private-export-hash",
          format: "CSV",
          reportKind: "DAILY",
        },
      },
      {
        details: {
          kind: "STAFF",
          newRole: "VALET_SUPERVISOR",
          previousRole: "VALET_EMPLOYEE",
        },
        entityType: "OrganizationMembership",
        eventType: "STAFF_ROLE_CHANGED",
        metadata: {
          membershipVersion: 3,
          newRole: "VALET_SUPERVISOR",
          previousRole: "VALET_EMPLOYEE",
        },
      },
      {
        details: {
          kind: "MANAGEMENT",
          operation: "CLEAR",
          settingKey: "ocrAssistEnabled",
        },
        entityType: "Location",
        eventType: "MANAGEMENT_LOCATION_SETTING_OVERRIDE_CHANGED",
        metadata: {
          newEffectiveValue: "true",
          operation: "CLEAR",
          settingKey: "ocrAssistEnabled",
        },
      },
    ] as const;

    const expected = new Map<string, unknown>();
    for (const family of familyCases) {
      const entityId = randomUUID();
      const eventId = await fixture.insertAuditEvent({
        actorMembershipId: state.membership.membershipId,
        entityId,
        entityType: family.entityType,
        eventType: family.eventType,
        locationId: state.location.locationId,
        metadata: family.metadata,
        occurredAt,
        organizationId: state.membership.organizationId,
      });
      expected.set(eventId, {
        actor: {
          membershipId: state.membership.membershipId,
          type: "MEMBERSHIP",
        },
        details: family.details,
        entity: {
          id: entityId,
          type:
            family.entityType === "ValetSession" ||
            family.entityType === "VALET_SESSION"
              ? "VALET_SESSION"
              : family.entityType === "Task"
                ? "TASK"
                : family.entityType === "Shift"
                  ? "SHIFT"
                  : family.entityType === "INCIDENT"
                    ? "INCIDENT"
                    : family.entityType === "Payment"
                      ? "PAYMENT"
                      : family.entityType === "LocationMapPoint"
                        ? "MAP_POINT"
                        : family.entityType === "OrganizationMembership"
                          ? "ORGANIZATION_MEMBERSHIP"
                          : "LOCATION",
        },
        eventId,
        eventType: family.eventType,
        occurredAt: occurredAt.toISOString(),
        scope: {
          kind: "LOCATION",
          locationId: state.location.locationId,
        },
      });
    }

    const result = await fixture.managementGet(
      organizationPath(state.membership.organizationId),
      state.auth.accessToken,
    );
    expect(result.status).toBe(200);
    expect(result.body?.items).toHaveLength(familyCases.length);
    for (const item of result.body?.items as Array<{ eventId: string }>) {
      expect(item).toEqual(expected.get(item.eventId));
    }
  });
});
