import { describe, expect, it } from "vitest";

import type { ManagementAuditAuthorization } from "../src/modules/management/management-audit-authorization";
import { projectManagementAuditEvent } from "../src/modules/management/management-audit-projection";
import type { ManagementAuditQueryRow } from "../src/modules/management/management-audit-query";

const id = "018f1234-5678-4abc-9234-56789abcdef0";
const org = "018f1234-5678-4abc-9234-56789abcdef1";
const location = "018f1234-5678-4abc-9234-56789abcdef2";
const membership = "018f1234-5678-4abc-9234-56789abcdef3";

const viewer: ManagementAuditAuthorization = {
  locationId: location, membershipId: membership,
  organizationId: org, role: "VALET_SUPERVISOR", scope: "LOCATION",
};
const row: ManagementAuditQueryRow = {
  id, organizationId: org, locationId: location,
  actorType: "MEMBERSHIP", actorMembershipId: membership,
  actorCurrentDisplayName: "أحمد محمد",
  entityId: id, entityType: "ValetSession", valetSessionId: id,
  eventType: "VALET_SESSION_COMPLETED",
  createdAt: new Date("2026-10-08T18:30:00Z"),
  occurredAt: new Date("2026-10-08T18:30:00Z"),
  metadataJson: {},
  vehicleConfirmedPlate: "19-52000",
  vehicleMake: "BMW",
  vehicleModel: "X5",
};

describe("Management Audit server projection identity boundary", () => {
  it("projects current membership and vehicle for authorized ValetSession events", () => {
    expect(projectManagementAuditEvent(row, viewer)).toMatchObject({
      actor: { type: "MEMBERSHIP", membershipId: membership, currentDisplayName: "أحمد محمد" },
      entity: { id, type: "VALET_SESSION" },
      vehicle: { confirmedPlate: "19-52000", make: "BMW", model: "X5" },
    });
  });

  it("keeps unknown events redacted even if query row has identities", () => {
    const unknown = projectManagementAuditEvent({ ...row, eventType: "FUTURE_EVENT" }, {
      ...viewer, role: "ORG_ADMIN", scope: "ORGANIZATION", locationId: null,
    });
    expect(unknown).not.toHaveProperty("actor");
    expect(unknown).not.toHaveProperty("vehicle");
  });

  it("refuses wrong-location and wrong-organization authority", () => {
    expect(() => projectManagementAuditEvent({
      ...row, locationId: id,
    }, viewer)).toThrow(/scope mismatch/);
    expect(() => projectManagementAuditEvent({
      ...row, organizationId: id,
    }, viewer)).toThrow(/scope mismatch/);
  });

  it("keeps non-membership and non-session targets free of unrelated identity", () => {
    const system = projectManagementAuditEvent({
      ...row, actorType: "SYSTEM", actorMembershipId: null,
      eventType: "TASK_ASSIGNED", entityType: "Task",
    }, viewer);
    expect(system).toMatchObject({ actor: { type: "SYSTEM" } });
    expect(system).not.toHaveProperty("vehicle");
  });

  it("does not show guessed or malformed current directory identity", () => {
    const missing = projectManagementAuditEvent({
      ...row, actorCurrentDisplayName: null,
      vehicleConfirmedPlate: null, vehicleMake: null, vehicleModel: null,
    }, viewer);
    expect(missing).toMatchObject({
      actor: { type: "MEMBERSHIP", membershipId: membership },
    });
    expect(missing).not.toHaveProperty("vehicle");
    const malformed = projectManagementAuditEvent({
      ...row, actorCurrentDisplayName: " ", vehicleConfirmedPlate: "PRIVATE\nVALUE",
    }, viewer);
    expect(malformed).toMatchObject({
      actor: { type: "MEMBERSHIP", membershipId: membership },
      vehicle: { confirmedPlate: null },
    });
  });
});
