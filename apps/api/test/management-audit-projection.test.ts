import { describe, expect, it } from "vitest";

import type { ManagementAuditAuthorization } from "../src/modules/management/management-audit-authorization";
import {
  managementAuditKnownEventTypes,
  managementAuditSupervisorEventTypes,
  projectManagementAuditEvent,
} from "../src/modules/management/management-audit-projection";
import type { ManagementAuditQueryRow } from "../src/modules/management/management-audit-query";

const eventId = "018f1234-5678-4abc-9234-56789abcdef0";
const organizationId = "018f1234-5678-4abc-9234-56789abcdef1";
const locationId = "018f1234-5678-4abc-9234-56789abcdef2";
const membershipId = "018f1234-5678-4abc-9234-56789abcdef3";

const admin: ManagementAuditAuthorization = {
  locationId: null,
  membershipId,
  organizationId,
  role: "ORG_ADMIN",
  scope: "ORGANIZATION",
};

const supervisor: ManagementAuditAuthorization = {
  locationId,
  membershipId,
  organizationId,
  role: "VALET_SUPERVISOR",
  scope: "LOCATION",
};

function row(
  eventType: string,
  metadataJson: unknown = {},
): ManagementAuditQueryRow {
  return {
    actorMembershipId: membershipId,
    actorType: "MEMBERSHIP",
    createdAt: new Date("2026-09-17T00:00:00.000Z"),
    entityId: eventId,
    entityType: "ValetSession",
    eventType,
    id: eventId,
    locationId,
    metadataJson,
    occurredAt: new Date("2026-09-17T00:00:00.000Z"),
    organizationId,
    valetSessionId: eventId,
  };
}

describe("management audit projection", () => {
  it("classifies and safely projects every current tenant event type", () => {
    const sensitiveMetadata = {
      amount: "999.000",
      contentSha256: "private-hash",
      key_slot_id: "private-slot",
      latitude: 31.9,
      locationIds: [locationId],
      longitude: 35.9,
      operatorRef: "private-operator",
      parkingSpotId: "private-spot",
      provider: "private-provider",
      reason: "private-reason",
      storage_object_key: "private-storage-key",
    };
    expect(managementAuditKnownEventTypes).toHaveLength(100);
    for (const eventType of managementAuditKnownEventTypes) {
      const projected = projectManagementAuditEvent(
        row(eventType, sensitiveMetadata),
        admin,
      );
      expect(projected.eventType).toBe(eventType);
      const serialized = JSON.stringify(projected);
      for (const secret of [
        "999.000",
        "private-hash",
        "private-slot",
        "private-operator",
        "private-spot",
        "private-provider",
        "private-storage-key",
      ]) {
        expect(serialized).not.toContain(secret);
      }
      if (eventType === "SHIFT_FORCE_ENDED")
        expect(projected.details).toMatchObject({ reason: "private-reason" });
      else expect(serialized).not.toContain("private-reason");
      expect(serialized).not.toContain("latitude");
      expect(serialized).not.toContain("longitude");
      expect(serialized).not.toContain("locationIds");
    }
  });

  it("uses an operational-only supervisor allowlist", () => {
    expect(managementAuditSupervisorEventTypes).toHaveLength(38);
    expect(managementAuditSupervisorEventTypes).toContain("TASK_ASSIGNED");
    expect(managementAuditSupervisorEventTypes).toContain(
      "VALET_SESSION_COMPLETED",
    );
    for (const excluded of [
      "SHIFT_STARTED",
      "SHIFT_FORCE_ENDED",
      "INCIDENT_OPENED",
      "PAYMENT_INITIALIZED",
      "MAP_SETUP_POINT_CREATED",
      "STAFF_ROLE_CHANGED",
      "MANAGEMENT_COMPANY_SETTING_DEFAULT_CHANGED",
      "LOCATION_DEACTIVATED",
      "VISIT_CONTACT_NAME_CORRECTED",
      "VISIT_CONTACT_PHONE_CORRECTED",
    ]) {
      expect(managementAuditSupervisorEventTypes).not.toContain(excluded);
      expect(() =>
        projectManagementAuditEvent(row(excluded), supervisor),
      ).toThrow();
    }
    expect(() =>
      projectManagementAuditEvent(row("VALET_SESSION_PARKED"), supervisor),
    ).not.toThrow();
  });

  it("allowlists lifecycle metadata without exposing correction reason or create fingerprint", () => {
    const projected = projectManagementAuditEvent(
      row("LOCATION_TIMEZONE_CORRECTED", {
        newTimezone: "Asia/Amman",
        previousTimezone: "UTC",
        reason: "private correction reason",
        requestFingerprint: "private-create-fingerprint",
      }),
      admin,
    );
    expect(projected.details).toEqual({
      kind: "MANAGEMENT",
      newTimezone: "Asia/Amman",
      previousTimezone: "UTC",
    });
    expect(JSON.stringify(projected)).not.toContain(
      "private correction reason",
    );
    expect(JSON.stringify(projected)).not.toContain(
      "private-create-fingerprint",
    );
  });

  it("projects Visit Contact correction metadata without raw PII", () => {
    const projected = projectManagementAuditEvent(
      {
        ...row("VISIT_CONTACT_PHONE_CORRECTED", {
          field: "phoneNormalized",
          name: "Private Name",
          normalizationVersion: "JORDAN_MOBILE_V1",
          phone: "+962790000001",
          plate: "12-ABC",
        }),
        entityType: "Customer",
      },
      admin,
    );
    expect(projected).toMatchObject({
      details: {
        field: "phoneNormalized",
        kind: "MANAGEMENT",
        normalizationVersion: "JORDAN_MOBILE_V1",
      },
      entity: { id: eventId, type: "CUSTOMER" },
    });
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain("Private Name");
    expect(serialized).not.toContain("+962790000001");
    expect(serialized).not.toContain("12-ABC");
  });

  it("fails closed for unknown events and raw entity types", () => {
    const projected = projectManagementAuditEvent(
      { ...row("FUTURE_EVENT", { metadata: "private" }), entityType: "Secret" },
      admin,
    );
    expect(projected).toMatchObject({
      details: { kind: "UNKNOWN" },
      entity: null,
      eventType: "UNKNOWN",
    });
    expect(projected).not.toHaveProperty("actor");
    expect(JSON.stringify(projected)).not.toContain("FUTURE_EVENT");
    expect(JSON.stringify(projected)).not.toContain("private");
    expect(() =>
      projectManagementAuditEvent(row("FUTURE_EVENT"), supervisor),
    ).toThrow();
  });

  it("minimizes actors and enforces the authorized projection scope", () => {
    const system = projectManagementAuditEvent(
      {
        ...row("VALET_SESSION_READY"),
        actorMembershipId: null,
        actorType: "SYSTEM",
      },
      admin,
    );
    expect(system).toMatchObject({ actor: { type: "SYSTEM" } });

    expect(() =>
      projectManagementAuditEvent(
        { ...row("VALET_SESSION_READY"), locationId: eventId },
        supervisor,
      ),
    ).toThrow("Management audit projection scope mismatch.");
  });
  it("projects cancellation as safe CHECK_IN metadata for authorized admin and Supervisor", () => {
    for (const authority of [admin, supervisor]) {
      const projected = projectManagementAuditEvent(
        row("VALET_SESSION_CHECK_IN_CANCELLED", {
          fromState: "CHECKING_IN",
          toState: "CANCELLED",
          fromVersion: 1,
          toVersion: 2,
          token: "never-project",
          reason: "never-project",
        }),
        authority,
      );
      expect(projected.eventType).toBe("VALET_SESSION_CHECK_IN_CANCELLED");
      expect(projected.details).toEqual({
        kind: "CHECK_IN",
        fromState: "CHECKING_IN",
        toState: "CANCELLED",
        fromVersion: 1,
        toVersion: 2,
      });
      expect(JSON.stringify(projected)).not.toContain("never-project");
    }
  });
});
