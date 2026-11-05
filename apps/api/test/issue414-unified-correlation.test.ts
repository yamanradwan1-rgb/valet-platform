import { describe, expect, it } from "vitest";
import {
  correlateManagementAlertUnifiedPreview,
  type ManagementAlertUnifiedCandidate,
} from "../src/modules/dashboard/management-alert-unified-correlation";

const organizationId = "484135d0-682a-4eb9-81ce-328fc0b77e89";
const locationId = "84560251-bbe0-4a6b-8507-f090222c6bac";
const id = (index: number) =>
  `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
const scope = { organizationId, locationId, allowOrganizationOnly: false };

function active(
  index: number,
  category: "ALT-01" | "ALT-02" | "ALT-03" | "ALT-04" | "ALT-10" | "ALT-11",
  sourceKind: "TASK" | "RETRIEVAL" | "PAYMENT" = "TASK",
): ManagementAlertUnifiedCandidate {
  return {
    category,
    caseKind: "ACTIVE",
    severity: category === "ALT-01" ? "CRITICAL" : "IMPORTANT",
    sourceKind,
    sourceId: id(index),
    episodeId: "current",
    organizationId,
    locationId,
    occurredAt: "2026-11-04T20:00:00.000Z",
    title: "Safe current condition",
  };
}

describe("Issue 414 unified source-authorized alert correlation", () => {
  it("requires current organization and location without leaking partial count", () => {
    expect(() =>
      correlateManagementAlertUnifiedPreview(
        [{ ...active(1, "ALT-02"), organizationId: id(99) }],
        scope,
      ),
    ).toThrow(/unauthorized scope/);
    expect(() =>
      correlateManagementAlertUnifiedPreview(
        [{ ...active(1, "ALT-02"), locationId: id(99) }],
        scope,
      ),
    ).toThrow(/unauthorized scope/);
  });

  it("only allows organization-only CA cases with server-proven authority", () => {
    const staff: ManagementAlertUnifiedCandidate = {
      category: "ALT-15",
      caseKind: "OCCURRENCE",
      severity: "IMPORTANT",
      sourceKind: "STAFF",
      sourceId: id(44),
      episodeId: "committed-audit-event",
      organizationId,
      locationId: null,
      occurredAt: "2026-11-04T20:00:00.000Z",
      title: "Sensitive staff change",
      seen: false,
      seenEligible: true,
    };
    expect(() =>
      correlateManagementAlertUnifiedPreview([staff], scope),
    ).toThrow(/unauthorized scope/);
    const preview = correlateManagementAlertUnifiedPreview([staff], {
      ...scope,
      allowOrganizationOnly: true,
    });
    expect(preview.count).toBe(1);
    expect(preview.items[0]?.caseKind).toBe("OCCURRENCE");
  });

  it("omits contradictory ALT-02/03 current Task cases", () => {
    const sourceId = id(2);
    const preview = correlateManagementAlertUnifiedPreview(
      [
        active(2, "ALT-02"),
        { ...active(2, "ALT-03"), sourceId },
        active(3, "ALT-02"),
      ],
      scope,
    );
    expect(preview.items.map((item) => item.sourceId)).toEqual([id(3)]);
  });

  it("suppresses same-attempt ALT-04 under currently overdue ALT-01", () => {
    const preview = correlateManagementAlertUnifiedPreview(
      [
        {
          ...active(2, "ALT-04"),
          retrievalAttemptKey: "attempt-9",
          sourceProvedAlt01Exclusion: true,
        },
        {
          ...active(5, "ALT-01", "RETRIEVAL"),
          retrievalAttemptKey: "attempt-9",
        },
      ],
      scope,
    );
    expect(preview.items.map((item) => item.category)).toEqual(["ALT-01"]);
  });

  it("fails closed on ALT-04 without a source-proven retrieval attempt", () => {
    const preview = correlateManagementAlertUnifiedPreview(
      [active(2, "ALT-04")],
      scope,
    );
    expect(preview.items).toEqual([]);
    expect(preview.count).toBe(0);
  });

  it("accepts an ALT-04 stage only with source SQL proof of pre-LIMIT ALT-01 exclusion", () => {
    const page = correlateManagementAlertUnifiedPreview(
      [{ ...active(2, "ALT-04"), sourceProvedAlt01Exclusion: true }],
      scope,
    );
    expect(page.items.map((item) => item.category)).toEqual(["ALT-04"]);
  });

  it("sorts current no-clock cases without a fabricated onset timestamp", () => {
    const locationStopped: ManagementAlertUnifiedCandidate = {
      category: "ALT-16",
      caseKind: "ACTIVE",
      severity: "IMPORTANT",
      sourceKind: "LOCATION",
      sourceId: id(1),
      episodeId: "current",
      organizationId,
      locationId,
      occurredAt: null,
      title: "Location intake stopped",
    };
    const preview = correlateManagementAlertUnifiedPreview(
      [locationStopped, active(2, "ALT-02")],
      scope,
    );
    expect(preview.items[0]?.category).toBe("ALT-02");
    expect(preview.items[1]?.occurredAt).toBeNull();
  });

  it("prioritizes unresolved ALT-11 over older failed ALT-10", () => {
    const preview = correlateManagementAlertUnifiedPreview(
      [active(4, "ALT-10", "PAYMENT"), active(4, "ALT-11", "PAYMENT")],
      scope,
    );
    expect(preview.items.map((item) => item.category)).toEqual(["ALT-11"]);
  });

  it("proves 20+ only from at least 21 authorized, distinct eligible cases", () => {
    const twenty = Array.from({ length: 20 }, (_, i) =>
      active(i + 1, "ALT-02"),
    );
    expect(correlateManagementAlertUnifiedPreview(twenty, scope)).toMatchObject(
      { count: 20, hasMore: false },
    );
    const overflow = correlateManagementAlertUnifiedPreview(
      [...twenty, active(21, "ALT-02")],
      scope,
    );
    expect(overflow.count).toBe(20);
    expect(overflow.hasMore).toBe(true);
    expect(overflow.items).toHaveLength(20);
  });

  it("keeps the exact SQL top21 prefix for equal-ms incident source IDs", () => {
    const incidents: ManagementAlertUnifiedCandidate[] = Array.from(
      { length: 21 },
      (_, index) => ({
        ...active(index + 2, "ALT-02"),
        category: "ALT-08",
        sourceKind: "INCIDENT",
      }),
    );
    const page = correlateManagementAlertUnifiedPreview(incidents, scope);
    expect(page.hasMore).toBe(true);
    expect(page.items.map((item) => item.sourceId)).toEqual(
      incidents
        .map((item) => item.sourceId)
        .sort((a, b) => b.localeCompare(a))
        .slice(0, 20),
    );
  });

  it("rejects invalid category, severity and forged Seen state", () => {
    expect(() =>
      correlateManagementAlertUnifiedPreview(
        [{ ...active(1, "ALT-02"), category: "ALT-14" as "ALT-02" }],
        scope,
      ),
    ).toThrow();
    expect(() =>
      correlateManagementAlertUnifiedPreview(
        [{ ...active(1, "ALT-02"), severity: "CRITICAL" }],
        scope,
      ),
    ).toThrow();
  });
});
