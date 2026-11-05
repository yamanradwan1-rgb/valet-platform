import { describe, expect, it } from "vitest";
import { unifiedPreviewSchemaForLocation } from "./alert-unified-preview-api";

const sourceId = "4e06a091-c449-47ea-a384-33773cc7df96";
const locationId = "7f0b68ac-bd0f-4ea0-a4fe-4b04cfe99e9c";
const otherLocation = "748e4a48-6bb1-47d7-a57a-9af72f0386ea";
const event = {
  id: `ALT-15:${sourceId}:event-1`,
  category: "ALT-15",
  caseKind: "OCCURRENCE",
  severity: "IMPORTANT",
  sourceKind: "STAFF",
  sourceId,
  episodeId: "event-1",
  locationId: null,
  occurredAt: "2026-11-04T20:30:00.000Z",
  title: "Sensitive staff change",
  seen: false,
  seenEligible: true,
};

describe("Issue414 source-local unified decoder", () => {
  it("admits CA organization-only source only when caller audience matches", () => {
    const value = { items: [event], count: 1, hasMore: false };
    expect(
      unifiedPreviewSchemaForLocation(locationId, true).safeParse(value)
        .success,
    ).toBe(true);
    expect(
      unifiedPreviewSchemaForLocation(locationId, false).safeParse(value)
        .success,
    ).toBe(false);
  });

  it("rejects foreign Location even with organization-only CA allowance", () => {
    const value = {
      items: [
        {
          ...event,
          category: "ALT-05",
          sourceKind: "TAKEOVER",
          severity: "CRITICAL",
          locationId: otherLocation,
        },
      ],
      count: 1,
      hasMore: false,
    };
    expect(
      unifiedPreviewSchemaForLocation(locationId, true).safeParse(value)
        .success,
    ).toBe(false);
  });

  it("rejects active Seen, ALT14 and invalid overflow", () => {
    const value = { items: [event], count: 1, hasMore: false };
    const schema = unifiedPreviewSchemaForLocation(locationId, true);
    expect(
      schema.safeParse({
        ...value,
        items: [{ ...event, category: "ALT-14" }],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...value,
        items: [{ ...event, caseKind: "ACTIVE" }],
      }).success,
    ).toBe(false);
    expect(schema.safeParse({ ...value, hasMore: true }).success).toBe(false);
  });
});
