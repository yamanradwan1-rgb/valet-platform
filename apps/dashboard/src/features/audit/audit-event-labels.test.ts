import { describe, expect, it } from "vitest";
import { managementAuditEventSchema } from "@valet/contracts";

import { auditActorLabel, auditEntityLabel } from "./audit-event-labels";

const eventId = "11111111-1111-4111-8111-111111111111";
const membershipId = "22222222-2222-4222-8222-222222222222";
const entityId = "33333333-3333-4333-8333-333333333333";

function event(actor: unknown) {
  return managementAuditEventSchema.parse({
    actor,
    details: { kind: "SHIFT", status: "ACTIVE" },
    entity: { id: entityId, type: "SHIFT" },
    eventId,
    eventType: "SHIFT_STARTED",
    occurredAt: "2026-09-22T10:00:00.000Z",
    scope: { kind: "LOCATION", locationId: entityId },
  });
}

describe("safe Audit actor and entity labels", () => {
  it("keeps membership ID secondary to the typed human label", () => {
    expect(
      auditActorLabel(event({ type: "MEMBERSHIP", membershipId })),
    ).toEqual({
      id: membershipId,
      label: "Staff member",
    });
  });

  it.each([
    "GUEST",
    "SYSTEM",
    "EXTERNAL_PROVIDER",
    "CONTROLLED_OPERATOR",
    "UNKNOWN",
  ] as const)("renders %s without extra identity data", (type) => {
    expect(auditActorLabel(event({ type }))?.label).not.toBe(type);
    expect(auditActorLabel(event({ type }), "ar")?.label).toMatch(
      /[\u0600-\u06ff]/u,
    );
    expect(auditActorLabel(event({ type }))).not.toHaveProperty("id");
  });

  it("keeps UNKNOWN events actor-free and entity-free", () => {
    const unknown = managementAuditEventSchema.parse({
      details: { kind: "UNKNOWN" },
      entity: null,
      eventId,
      eventType: "UNKNOWN",
      occurredAt: "2026-09-22T10:00:00.000Z",
      scope: { kind: "ORGANIZATION" },
    });
    expect(auditActorLabel(unknown)).toBeNull();
    expect(auditEntityLabel(unknown)).toBe("No target");
  });

  it("shows the current authorized name consistently in Arabic and English", () => {
    const current = event({
      type: "MEMBERSHIP", membershipId, currentDisplayName: "أحمد محمد",
    });
    expect(auditActorLabel(current, "ar")).toEqual({
      id: membershipId, label: "أحمد محمد",
    });
    expect(auditActorLabel(current, "en")?.label).toBe("أحمد محمد");
  });

  it("shows confirmed plate and make/model only for a vehicle target", () => {
    const base = {
      actor: { type: "SYSTEM" },
      details: { kind: "SESSION" },
      entity: { id: entityId, type: "VALET_SESSION" },
      eventId, eventType: "VALET_SESSION_COMPLETED",
      occurredAt: "2026-09-22T10:00:00.000Z",
      scope: { kind: "LOCATION", locationId: entityId },
      vehicle: { confirmedPlate: "19-52000", make: "BMW", model: "X5" },
    };
    const vehicle = managementAuditEventSchema.parse(base);
    expect(auditEntityLabel(vehicle)).toBe("19-52000");
    expect(auditEntityLabel(vehicle, "ar")).toBe("19-52000");
    expect(auditEntityLabel(event({ type: "SYSTEM" }))).toBe("Shift");
    expect(auditEntityLabel(managementAuditEventSchema.parse({
      ...base, vehicle: undefined,
    }))).toBe("Valet session");
  });
});
