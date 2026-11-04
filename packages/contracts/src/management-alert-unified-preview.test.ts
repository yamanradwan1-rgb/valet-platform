import { describe, expect, it } from "vitest";
import {
  managementAlertUnifiedItemSchema,
  managementAlertUnifiedPreviewResponseSchema,
} from "./management-alert-unified-preview";
import { managementAlertPreviewResponseSchema } from "./management-alert-preview";

const uuid = "4e06a091-c449-47ea-a384-33773cc7df96";
const locationId = "7f0b68ac-bd0f-4ea0-a4fe-4b04cfe99e9c";

const active = {
  id: `ALT-16:${uuid}:current`,
  category: "ALT-16",
  caseKind: "ACTIVE",
  severity: "IMPORTANT",
  sourceKind: "LOCATION",
  sourceId: uuid,
  episodeId: "current",
  locationId,
  occurredAt: "2026-11-04T20:30:00.000Z",
  title: "Location intake stopped",
} as const;

const occurrence = {
  id: `ALT-05:${uuid}:event-1`,
  category: "ALT-05",
  caseKind: "OCCURRENCE",
  severity: "CRITICAL",
  sourceKind: "TAKEOVER",
  sourceId: uuid,
  episodeId: "event-1",
  locationId,
  occurredAt: "2026-11-04T20:30:00.000Z",
  title: "Emergency takeover",
  seen: false,
  seenEligible: true,
} as const;

describe("Issue 414 unified category contract remains fail-closed", () => {
  it("accepts a current condition without any Seen fields", () => {
    expect(managementAlertUnifiedItemSchema.safeParse(active).success).toBe(
      true,
    );
  });

  it("accepts a committed, unseen eligible occurrence", () => {
    expect(managementAlertUnifiedItemSchema.safeParse(occurrence).success).toBe(
      true,
    );
  });

  it("rejects Seen on active cases and absent Seen on occurrences", () => {
    expect(
      managementAlertUnifiedItemSchema.safeParse({
        ...active,
        seen: false,
      }).success,
    ).toBe(false);
    expect(
      managementAlertUnifiedItemSchema.safeParse({
        ...occurrence,
        seen: undefined,
      }).success,
    ).toBe(false);
  });

  it("rejects disabled category, wrong kind, wrong severity and scope", () => {
    const cases = [
      { ...active, category: "ALT-14" },
      { ...occurrence, caseKind: "ACTIVE", seen: undefined },
      { ...occurrence, severity: "IMPORTANT" },
      { ...occurrence, sourceKind: "GEOFENCE" },
      { ...active, locationId: null },
    ];
    for (const candidate of cases) {
      expect(
        managementAlertUnifiedItemSchema.safeParse(candidate).success,
      ).toBe(false);
    }
  });

  it("permits only Organization-scoped ALT-15/17 with null Location", () => {
    const staff = {
      ...occurrence,
      category: "ALT-15",
      severity: "IMPORTANT",
      sourceKind: "STAFF",
      locationId: null,
    };
    expect(managementAlertUnifiedItemSchema.safeParse(staff).success).toBe(
      true,
    );
    expect(
      managementAlertUnifiedItemSchema.safeParse({
        ...staff,
        locationId,
      }).success,
    ).toBe(false);
  });

  it("requires authorized count and overflow to agree with 20-item page", () => {
    expect(
      managementAlertUnifiedPreviewResponseSchema.safeParse({
        items: [active, occurrence],
        count: 2,
        hasMore: false,
      }).success,
    ).toBe(true);
    expect(
      managementAlertUnifiedPreviewResponseSchema.safeParse({
        items: [active, occurrence],
        count: 1,
        hasMore: false,
      }).success,
    ).toBe(false);
    expect(
      managementAlertUnifiedPreviewResponseSchema.safeParse({
        items: [active, occurrence],
        count: 2,
        hasMore: true,
      }).success,
    ).toBe(false);
  });

  it("does not silently widen legacy Phase-1 live response schema", () => {
    expect(
      managementAlertPreviewResponseSchema.safeParse({
        items: [active],
        count: 1,
        hasMore: false,
      }).success,
    ).toBe(false);
  });
});
