import { describe, expect, it } from "vitest";
import { correlateManagementAlertUnifiedPreview } from "../src/modules/dashboard/management-alert-unified-correlation";
import {
  projectActiveAlert,
  projectCommittedOccurrence,
  projectPhaseOneAlert,
} from "../src/modules/dashboard/management-alert-unified-projection";

const organizationId = "484135d0-682a-4eb9-81ce-328fc0b77e89";
const locationId = "84560251-bbe0-4a6b-8507-f090222c6bac";
const sourceId = "4e06a091-c449-47ea-a384-33773cc7df96";
const base = {
  organizationId,
  locationId,
  sourceId,
  episodeId: sourceId,
  title: "Safe",
};
const scope = { organizationId, locationId, allowOrganizationOnly: true };

describe("Issue414 additive source projections", () => {
  it("preserves Phase-1 category and active severity", () => {
    const p1 = projectPhaseOneAlert({
      ...base,
      category: "ALT-01",
      severity: "CRITICAL",
      sourceKind: "RETRIEVAL",
      occurredAt: "2026-11-05T12:00:00.000Z",
    });
    const result = correlateManagementAlertUnifiedPreview([p1], scope);
    expect(result.items).toMatchObject([
      { caseKind: "ACTIVE", category: "ALT-01" },
    ]);
  });

  it("requires source-proven ALT-04 overlap exclusion without guessing attempt keys", () => {
    const stage = projectActiveAlert({
      ...base,
      category: "ALT-04",
      severity: "IMPORTANT",
      sourceKind: "TASK",
      occurredAt: "2026-11-05T12:00:00.000Z",
    });
    expect(correlateManagementAlertUnifiedPreview([stage], scope).count).toBe(
      1,
    );
  });

  it("shows ALT-16 current condition without invented stopped-since timestamp", () => {
    const stop = projectActiveAlert({
      ...base,
      category: "ALT-16",
      severity: "IMPORTANT",
      sourceKind: "LOCATION",
      episodeId: "current",
      occurredAt: null,
    });
    const result = correlateManagementAlertUnifiedPreview([stop], scope);
    expect(result.items[0]?.occurredAt).toBeNull();
    expect(result.items[0]?.caseKind).toBe("ACTIVE");
  });

  it("makes terminal handoff proof a Seen-eligible occurrence not an active condition", () => {
    const occurrence = projectCommittedOccurrence({
      ...base,
      category: "ALT-07",
      severity: "CRITICAL",
      sourceKind: "HANDOFF",
      occurredAt: "2026-11-05T12:00:00.000Z",
    });
    expect(
      correlateManagementAlertUnifiedPreview([occurrence], scope).items[0],
    ).toMatchObject({
      caseKind: "OCCURRENCE",
      seen: false,
      seenEligible: true,
    });
  });
});
