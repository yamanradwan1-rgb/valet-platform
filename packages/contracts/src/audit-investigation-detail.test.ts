import { describe, expect, it } from "vitest";
import {
  auditInvestigationEventDetailSchema,
  auditInvestigationDetailParamsSchema,
} from "./audit-investigation-detail.js";

const id = "018f1234-5678-4abc-9234-56789abcdef0";
const at = "2026-10-23T11:00:00.000Z";
const common = {
  key: { source: "INCIDENT", eventId: id }, sessionId: id,
  occurredAt: at, quality: "RECORDED", actor: null,
  participants: [], references: [], relatedEvidence: [],
};

describe("detail boundary", () => {
  it("bounds source/path IDs and rejects free-form source routing", () => {
    expect(auditInvestigationDetailParamsSchema.safeParse({
      sessionId: id, source: "INCIDENT", eventId: id,
    }).success).toBe(true);
    expect(auditInvestigationDetailParamsSchema.safeParse({
      sessionId: id, source: "incidents;DROP", eventId: id,
    }).success).toBe(false);
  });

  it("shows reported Incident status as current without revealing raw description", () => {
    const item = {
      ...common, source: "INCIDENT", kind: "INCIDENT_REPORTED",
      incident: { type: "KEY_MISSING", severity: "HIGH", status: "OPEN",
        statusBasis: "CURRENT", resolutionAvailable: false },
    };
    expect(auditInvestigationEventDetailSchema.safeParse(item).success).toBe(true);
    expect(auditInvestigationEventDetailSchema.safeParse({
      ...item, description: "private incident text",
    }).success).toBe(false);
  });

  it("uses strict source-discriminated projections and rejects source/key mismatch", () => {
    const samples = [
      { ...common, source: "AUDIT", kind: "VALET_SESSION_PARKED",
        key: { source: "AUDIT", eventId: id } },
      { ...common, source: "KEY_CUSTODY", kind: "SLOT_CLEARED",
        keySlotId: id, key: { source: "KEY_CUSTODY", eventId: id } },
      { ...common, source: "DISPATCH", kind: "REASSIGNED",
        taskId: id, key: { source: "DISPATCH", eventId: id } },
    ];
    samples.forEach((item) => {
      expect(auditInvestigationEventDetailSchema.safeParse(item).success).toBe(true);
    });
    expect(auditInvestigationEventDetailSchema.safeParse({
      ...samples[0], key: { source: "INCIDENT", eventId: id },
    }).success).toBe(false);
    expect(auditInvestigationEventDetailSchema.safeParse({
      ...samples[2], overrideReason: "Private note",
    }).success).toBe(false);
  });

  it("permits an authentically unbound RELEASED custody event, not a slot-less assignment", () => {
    const released = {
      ...common,
      source: "KEY_CUSTODY",
      kind: "RELEASED",
      keySlotId: null,
      key: { source: "KEY_CUSTODY", eventId: id },
    };
    expect(auditInvestigationEventDetailSchema.safeParse(released).success).toBe(true);
    expect(auditInvestigationEventDetailSchema.safeParse({
      ...released, kind: "SLOT_ASSIGNED",
    }).success).toBe(false);
  });
});
