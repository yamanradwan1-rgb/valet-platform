import { describe, expect, it } from "vitest";
import {
  auditInvestigationTimelineQuerySchema,
  auditInvestigationTimelineEventSchema,
  auditInvestigationTimelineResponseSchema,
} from "./audit-investigation-timeline.js";

const id = "018f1234-5678-4abc-9234-56789abcdef0";
const at = "2026-10-23T11:00:00.000Z";

describe("timeline safe projection", () => {
  it("keeps the full timeline distinct from discovery window filters", () => {
    expect(auditInvestigationTimelineQuerySchema.parse({}).limit).toBe(50);
    expect(auditInvestigationTimelineQuerySchema.safeParse({
      from: at, to: at,
    }).success).toBe(false);
    expect(auditInvestigationTimelineQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it("requires source and event ID and excludes raw evidence metadata", () => {
    const event = {
      key: { source: "KEY_CUSTODY", eventId: id },
      occurredAt: at, kind: "SLOT_CLEARED",
      quality: "RECORDED", actor: null, participants: [],
      references: [], relatedEvidence: [],
    };
    expect(auditInvestigationTimelineEventSchema.safeParse(event).success).toBe(true);
    expect(auditInvestigationTimelineEventSchema.safeParse({
      ...event, secret_hash: "do-not-return",
    }).success).toBe(false);
    expect(auditInvestigationTimelineEventSchema.safeParse({
      ...event, key: { source: "OTHER", eventId: id },
    }).success).toBe(false);
  });

  it("bounds response pages and forbids inventing actor names or unsafe refs", () => {
    const label = { value: null, basis: "CURRENT", unavailable: true };
    const response = {
      session: {
        sessionId: id, currentState: "PARKED", currentStateBasis: "CURRENT",
        currentVehicle: {
          make: label, model: label, plate: label, plateCountry: label,
          temporaryDescriptor: label,
        },
        currentKeySlot: { keySlotId: null, code: label },
      },
      items: [], nextCursor: null, snapshotAt: at, order: "ASC",
      coverage: {
        AUDIT: { status: "AVAILABLE" }, KEY_CUSTODY: { status: "PARTIAL" },
        DISPATCH: { status: "AVAILABLE" }, INCIDENT: { status: "UNAVAILABLE" },
      },
    };
    expect(auditInvestigationTimelineResponseSchema.safeParse(response).success).toBe(true);
    expect(auditInvestigationTimelineResponseSchema.safeParse({
      ...response, order: "DESC",
    }).success).toBe(false);
    expect(auditInvestigationTimelineResponseSchema.safeParse({
      ...response, items: Array(101).fill({}),
    }).success).toBe(false);
    expect(auditInvestigationTimelineEventSchema.safeParse({
      key: { source: "AUDIT", eventId: id }, occurredAt: at,
      kind: "VALET_SESSION_COMPLETED", quality: "RECORDED",
      actor: null, participants: [], references: [{
        kind: "SESSION", id, rawMetadata: {},
      }], relatedEvidence: [],
    }).success).toBe(false);
  });
});
