import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  declineTaskRequestSchema,
  reassignTaskRequestSchema,
} from "./dispatch.js";
import { handoffReasonRequestSchema } from "./handoff.js";
import { reportIncidentRequestSchema } from "./incidents.js";
import { managementLocationCreateRequestSchema } from "./management-location-lifecycle.js";
import { utf16StringMax } from "./utf16-string-max.js";

const id = "00000000-0000-4000-8000-000000000001";

describe("Zod 4.6 UTF-16 string limit compatibility", () => {
  it("preserves handoff's 500-unit reason cap and too_big issue", () => {
    const request = { expectedSessionVersion: 1, reason: "😀".repeat(250) };
    expect(handoffReasonRequestSchema.safeParse(request).success).toBe(true);
    const invalid = handoffReasonRequestSchema.safeParse({
      ...request,
      reason: `  ${"😀".repeat(251)}  `,
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues).toEqual([
        expect.objectContaining({
          code: "too_big",
          origin: "string",
          maximum: 500,
          path: ["reason"],
        }),
      ]);
    }
    const ascii = handoffReasonRequestSchema.safeParse({
      ...request,
      reason: "x".repeat(501),
    });
    expect(ascii.success).toBe(false);
    if (!ascii.success) expect(ascii.error.issues).toHaveLength(1);
  });

  it("preserves dispatch's optional decline and required reassign caps", () => {
    const reason = "😀".repeat(250);
    const decline = { expectedVersion: 1, reason };
    const reassign = { ...decline, targetAssigneeMembershipId: id };
    expect(declineTaskRequestSchema.safeParse(decline).success).toBe(true);
    expect(reassignTaskRequestSchema.safeParse(reassign).success).toBe(true);
    expect(
      declineTaskRequestSchema.safeParse({
        ...decline,
        reason: "😀".repeat(251),
      }).success,
    ).toBe(false);
    expect(
      reassignTaskRequestSchema.safeParse({
        ...reassign,
        reason: "😀".repeat(251),
      }).success,
    ).toBe(false);
  });

  it("preserves incident description's 500-unit cap", () => {
    const request = {
      incidentId: id,
      severity: "HIGH",
      type: "OTHER",
      description: "😀".repeat(250),
    };
    expect(reportIncidentRequestSchema.safeParse(request).success).toBe(true);
    expect(
      reportIncidentRequestSchema.safeParse({
        ...request,
        description: "😀".repeat(251),
      }).success,
    ).toBe(false);
  });

  it("preserves parameterized string bounds in location creation", () => {
    const request = {
      operationId: id,
      name: "😀".repeat(100),
      code: "L1",
      addressText: "Street A",
      timezone: "Asia/Amman",
      currency: "JOD",
    };
    expect(
      managementLocationCreateRequestSchema.safeParse(request).success,
    ).toBe(true);
    expect(
      managementLocationCreateRequestSchema.safeParse({
        ...request,
        name: "😀".repeat(101),
      }).success,
    ).toBe(false);
  });

  it("leaves numeric and array max validation unchanged", () => {
    const number = z.number().max(2);
    const array = z.array(z.number()).max(2);
    expect(number.safeParse(2).success).toBe(true);
    expect(number.safeParse(3).success).toBe(false);
    expect(array.safeParse([1, 2]).success).toBe(true);
    expect(array.safeParse([1, 2, 3]).success).toBe(false);
    const text = z.string().superRefine(utf16StringMax(1));
    expect(text.safeParse("A").success).toBe(true);
    expect(text.safeParse("😀").success).toBe(false);
  });
});
