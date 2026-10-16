import { describe, expect, it } from "vitest";
import { managementAuditResponseSchema } from "./management-audit.js";

const eventId = "018f1234-5678-4abc-9234-56789abcdef0";
const membershipId = "018f1234-5678-4abc-9234-56789abcdef2";
const locationId = "018f1234-5678-4abc-9234-56789abcdef1";

const event = {
  eventId,
  eventType: "VALET_SESSION_COMPLETED",
  occurredAt: "2026-09-17T00:00:00.000Z",
  scope: { kind: "LOCATION", locationId },
  actor: { type: "MEMBERSHIP", membershipId, currentDisplayName: "أحمد محمد" },
  entity: { type: "VALET_SESSION", id: eventId },
  details: { kind: "SESSION" },
  vehicle: { confirmedPlate: "19-52000", make: "BMW", model: "X5" },
} as const;

describe("management audit read-only identity enrichment", () => {
  it("accepts server-projected current identity and confirmed vehicle", () => {
    const response = managementAuditResponseSchema.parse({
      items: [event], nextCursor: null,
    });
    expect(response.items[0]).toMatchObject(event);
    expect(managementAuditResponseSchema.safeParse({
      items: [{
        ...event, vehicle: undefined,
        actor: { type: "MEMBERSHIP", membershipId },
      }],
      nextCursor: null,
    }).success).toBe(true);
  });

  it("rejects extra PII, malformed names and vehicle payloads", () => {
    for (const invalid of [
      { ...event, actor: { ...event.actor, email: "private@example.test" } },
      { ...event, actor: { ...event.actor, currentDisplayName: "  " } },
      { ...event, vehicle: { ...event.vehicle, privateNote: "secret" } },
      { ...event, vehicle: { ...event.vehicle, confirmedPlate: "" } },
    ]) {
      expect(managementAuditResponseSchema.safeParse({
        items: [invalid], nextCursor: null,
      }).success).toBe(false);
    }
  });

  it("rejects enriched identities on UNKNOWN events", () => {
    const unknown = {
      details: { kind: "UNKNOWN" }, entity: null, eventId,
      eventType: "UNKNOWN", occurredAt: event.occurredAt, scope: event.scope,
    };
    expect(managementAuditResponseSchema.safeParse({
      items: [{ ...unknown, actor: event.actor, vehicle: event.vehicle }],
      nextCursor: null,
    }).success).toBe(false);
  });
});
