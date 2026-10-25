import { describe, expect, it } from "vitest";
import {
  incidentListQuerySchema,
  incidentResolutionRequestSchema,
} from "./incident-resolution.js";

describe("#337 explicit resolution contract", () => {
  const valid = {
    operationId: "11111111-1111-4111-8111-111111111111",
    expectedStatus: "OPEN",
    resolutionNotes: "  Synthetic resolution  ",
  };
  it("defaults the list to All", () => {
    expect(incidentListQuerySchema.parse({}).filter).toBe("ALL");
  });
  it("normalizes a bounded deliberate note", () => {
    expect(incidentResolutionRequestSchema.parse(valid).resolutionNotes).toBe(
      "Synthetic resolution",
    );
  });
  it.each([
    { ...valid, resolutionNotes: " " },
    { ...valid, resolutionNotes: "x".repeat(1001) },
    { ...valid, expectedStatus: "CLOSED" },
    { ...valid, resolver: "client" },
    { ...valid, resolvedAt: "2026-10-25T00:00:00Z" },
  ])("rejects invalid or client-authoritative fields", (value) => {
    expect(incidentResolutionRequestSchema.safeParse(value).success).toBe(
      false,
    );
  });
});
