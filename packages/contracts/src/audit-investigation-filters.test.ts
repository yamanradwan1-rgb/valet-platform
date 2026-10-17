import { describe, expect, it } from "vitest";
import {
  auditInvestigationFilterQuerySchema,
  auditInvestigationFilterResponseSchema,
} from "./audit-investigation-filters.js";

const id = "018f1234-5678-4abc-9234-56789abcdef0";

describe("bounded selector directory", () => {
  it("accepts only purpose-limited selectors with short text and page limit", () => {
    expect(auditInvestigationFilterQuerySchema.parse({
      kind: "MEMBER", text: "Maya",
    }).limit).toBe(20);
    expect(auditInvestigationFilterQuerySchema.safeParse({
      kind: "MEMBER", text: "a".repeat(81),
    }).success).toBe(false);
    expect(auditInvestigationFilterQuerySchema.safeParse({
      kind: "MEMBER", text: "Maya", includeEmail: true,
    }).success).toBe(false);
  });

  it("only exposes exact IDs and current safe labels, never contact details", () => {
    const item = { id, currentLabel: { value: "Maya Saeed", basis: "CURRENT", unavailable: false } };
    const payload = { kind: "MEMBER", items: [item], nextCursor: null, hasMore: false };
    expect(auditInvestigationFilterResponseSchema.safeParse(payload).success).toBe(true);
    expect(auditInvestigationFilterResponseSchema.safeParse({
      ...payload, items: [{ ...item, email: "private@test.invalid" }],
    }).success).toBe(false);
    expect(auditInvestigationFilterResponseSchema.safeParse({
      ...payload, items: Array(21).fill(item),
    }).success).toBe(false);
  });
});
