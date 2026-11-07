import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  auditInvestigationCursorSchema,
  auditInvestigationSafePersonSchema,
} from "./audit-investigation-common.js";
import {
  incidentOverviewEntrySchema,
  taskOverviewEntrySchema,
} from "./location-overview.js";
import { managementAuditActorSchema } from "./management-audit.js";
import { managementVisitContactSearchQuerySchema } from "./management-visit-contacts.js";
import { utf16StringMin } from "./utf16-string-min.js";

const id = "00000000-0000-4000-8000-000000000001";

describe("Zod 4.6 UTF-16 minimum compatibility", () => {
  it("preserves native Zod too_small error metadata and message", () => {
    const ascii = "xx";
    const native = z.string().min(3).safeParse(ascii);
    const utf16 = z.string().superRefine(utf16StringMin(3)).safeParse(ascii);
    expect(native.success).toBe(false);
    expect(utf16.success).toBe(false);
    if (!native.success && !utf16.success) {
      expect(utf16.error.issues).toEqual(native.error.issues);
    }
  });

  it("accepts a single emoji for visit-contact names with min(2)", () => {
    expect(
      managementVisitContactSearchQuerySchema.safeParse({ name: "😀" }).success,
    ).toBe(true);
    const invalid = managementVisitContactSearchQuerySchema.safeParse({
      name: "x",
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues).toEqual([
        expect.objectContaining({
          code: "too_small",
          origin: "string",
          minimum: 2,
          inclusive: true,
          path: ["name"],
        }),
      ]);
    }
    expect(
      managementVisitContactSearchQuerySchema.safeParse({
        name: "😀".repeat(41),
      }).success,
    ).toBe(false);
  });

  it("trims audit person names before enforcing min(3) UTF-16 units", () => {
    const record = { membershipId: id, currentDisplayName: "  😀x  " };
    expect(auditInvestigationSafePersonSchema.parse(record)).toEqual({
      ...record,
      currentDisplayName: "😀x",
    });
    expect(
      auditInvestigationSafePersonSchema.safeParse({
        ...record,
        currentDisplayName: " 😀 ",
      }).success,
    ).toBe(false);
    expect(
      auditInvestigationSafePersonSchema.safeParse({
        ...record,
        currentDisplayName: null,
      }).success,
    ).toBe(true);
  });

  it("preserves all three location-overview display-name boundaries", () => {
    const cancellationName = taskOverviewEntrySchema.shape.cancellation
      .unwrap()
      .unwrap().shape.displayName;
    const reporterName = incidentOverviewEntrySchema.shape.reporterDisplayName;
    const resolverName =
      incidentOverviewEntrySchema.shape.resolvedByDisplayName;
    for (const schema of [cancellationName, reporterName, resolverName]) {
      expect(schema.safeParse("😀x").success).toBe(true);
      expect(schema.safeParse("😀").success).toBe(false);
      expect(schema.safeParse("xx").success).toBe(false);
      expect(schema.safeParse(null).success).toBe(true);
      expect(schema.safeParse("😀".repeat(201)).success).toBe(false);
    }
    expect(resolverName.safeParse(undefined).success).toBe(true);
  });

  it("preserves audit actor display-name minimum with optional semantics", () => {
    const actor = { type: "MEMBERSHIP", membershipId: id };
    expect(managementAuditActorSchema.safeParse(actor).success).toBe(true);
    expect(
      managementAuditActorSchema.safeParse({
        ...actor,
        currentDisplayName: "😀x",
      }).success,
    ).toBe(true);
    expect(
      managementAuditActorSchema.safeParse({
        ...actor,
        currentDisplayName: "😀",
      }).success,
    ).toBe(false);
  });

  it("does not widen ASCII-restricted cursors or min(1) Unicode", () => {
    expect(auditInvestigationCursorSchema.safeParse("abcdefgh").success).toBe(
      true,
    );
    expect(
      auditInvestigationCursorSchema.safeParse("😀".repeat(4)).success,
    ).toBe(false);
    expect(
      auditInvestigationSafePersonSchema.safeParse({
        membershipId: id,
        currentDisplayName: "😀x",
      }).success,
    ).toBe(true);
  });
});
