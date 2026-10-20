import { describe, expect, it } from "vitest";
import {
  auditInvestigationSearchQuerySchema,
  auditInvestigationSearchResponseSchema,
} from "./audit-investigation-search.js";

const id = "018f1234-5678-4abc-9234-56789abcdef0";
const from = "2026-10-23T11:00:00.000Z";
const to = "2026-10-23T12:00:00.000Z";

describe("bounded search contracts", () => {
  it("normalizes bounded defaults and rejects unauthorized query fields", () => {
    expect(auditInvestigationSearchQuerySchema.parse({ from, to }).limit).toBe(25);
    expect(auditInvestigationSearchQuerySchema.safeParse({
      from, to, organizationId: id,
    }).success).toBe(false);
    expect(auditInvestigationSearchQuerySchema.safeParse({
      from, to, metadataKey: "actor",
    }).success).toBe(false);
    expect(auditInvestigationSearchQuerySchema.safeParse({
      from, to, limit: 101,
    }).success).toBe(false);
  });

  it("enforces strict elapsed-day and half-open time bounds", () => {
    for (const q of [
      { from, to: from },
      { from: to, to: from },
      { from, to: "2026-11-24T11:00:00.000Z" },
    ]) expect(auditInvestigationSearchQuerySchema.safeParse(q).success).toBe(false);
    expect(auditInvestigationSearchQuerySchema.safeParse({
      from: "2026-10-23T00:00:00.000Z", to: "2026-10-24T00:00:00.000Z",
      sessionId: id, keySlotId: id, membershipId: id,
    }).success).toBe(true);
  });

  it("rejects metadata and fabricated counts/reasons in response", () => {
    const response = {
      items: [], nextCursor: null, snapshotAt: from,
      semanticsVersion: 1, coverage: {
        AUDIT: { status: "AVAILABLE" }, KEY_CUSTODY: { status: "AVAILABLE" },
        DISPATCH: { status: "AVAILABLE" }, INCIDENT: { status: "AVAILABLE" },
      },
    };
    expect(auditInvestigationSearchResponseSchema.safeParse(response).success).toBe(true);
    expect(auditInvestigationSearchResponseSchema.safeParse({
      ...response, items: Array(101).fill({}),
    }).success).toBe(false);
    expect(auditInvestigationSearchResponseSchema.safeParse({
      ...response, totalUniverseCount: 500000,
    }).success).toBe(false);
  });

  it("distinguishes current labels and typed historical witness participation", () => {
    const label = (value: string | null) => ({
      value, basis: "CURRENT", unavailable: value === null,
    });
    const item = {
      sessionId: id,
      currentVehicle: {
        make: label("Toyota"), model: label("Camry"),
        plate: label(null), plateCountry: label(null),
        temporaryDescriptor: label(null),
      },
      currentKeySlot: { keySlotId: null, code: label(null) },
      currentState: "COMPLETED", currentStateBasis: "CURRENT",
      firstMatchedAt: from, lastMatchedAt: to,
      matchingRecordCount: 2,
      matchReasons: [
        { source: "KEY_CUSTODY", eventId: id, matchedBy: "KEY_SLOT" },
        { source: "DISPATCH", eventId: id, matchedBy: "EMPLOYEE",
          participationRole: "PREVIOUS_ASSIGNEE" },
      ],
      hasVisibleIncident: false, matchedIncidentCount: 0,
      coverage: {
        AUDIT: { status: "AVAILABLE" }, KEY_CUSTODY: { status: "AVAILABLE" },
        DISPATCH: { status: "AVAILABLE" }, INCIDENT: { status: "NOT_AUTHORIZED" },
      },
    };
    expect(auditInvestigationSearchResponseSchema.safeParse({
      items: [item], nextCursor: null, snapshotAt: from,
      semanticsVersion: 1, coverage: item.coverage,
    }).success).toBe(true);
    expect(auditInvestigationSearchResponseSchema.safeParse({
      items: [{ ...item, currentState: "OPEN" }], nextCursor: null,
      snapshotAt: from, semanticsVersion: 1, coverage: item.coverage,
    }).success).toBe(false);
    expect(auditInvestigationSearchResponseSchema.safeParse({
      items: [{ ...item, matchReasons: [{ source: "KEY_CUSTODY",
        eventId: id, matchedBy: "KEY_SLOT",
        participationRole: "ACTOR" }] }], nextCursor: null,
      snapshotAt: from, semanticsVersion: 1, coverage: item.coverage,
    }).success).toBe(false);
  });
});
