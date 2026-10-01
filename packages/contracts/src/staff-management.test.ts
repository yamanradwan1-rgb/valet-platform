import { describe, expect, it } from "vitest";
import {
  staffDirectoryQuerySchema,
  staffManagementIdentitySchema,
  staffManagementDisplayName,
} from "./staff-management.js";

describe("T05-A canonical staff identity", () => {
  const legacy = {
    email: "legacy@example.com",
    firstName: null,
    lastName: null,
  };
  it("requires real email and explicit nullable legacy names", () => {
    expect(staffManagementIdentitySchema.parse(legacy)).toEqual(legacy);
    expect(staffManagementDisplayName(legacy)).toBe(legacy.email);
    for (const invalid of [
      { ...legacy, email: undefined },
      { ...legacy, email: "fake" },
      { email: legacy.email },
      { ...legacy, userId: "hidden" },
    ]) {
      expect(staffManagementIdentitySchema.safeParse(invalid).success).toBe(
        false,
      );
    }
  });
  it("preserves Unicode, punctuation and diacritics with one complete-name formatter", () => {
    const identity = staffManagementIdentitySchema.parse({
      email: "staff@example.com",
      firstName: "  مُحَمَّد  ",
      lastName: "  O’Connor-أبو زيد\u00a0",
    });
    expect(identity.firstName).toBe("مُحَمَّد");
    expect(staffManagementDisplayName(identity)).toBe(
      "مُحَمَّد O’Connor-أبو زيد",
    );
    expect(staffManagementDisplayName({ ...identity, lastName: null })).toBe(
      identity.email,
    );
    expect(staffManagementDisplayName({ ...identity, firstName: null })).toBe(
      identity.email,
    );
  });
  it("rejects blank and >100-code-point names and accepts the exact Unicode boundary", () => {
    for (const firstName of ["", " \t\u3000", "أ".repeat(101)]) {
      expect(
        staffManagementIdentitySchema.safeParse({ ...legacy, firstName })
          .success,
      ).toBe(false);
    }
    expect(
      staffManagementIdentitySchema.parse({
        ...legacy,
        firstName: "𐐀".repeat(100),
      }).firstName,
    ).toBe("𐐀".repeat(100));
  });
});

describe("T05-A strict directory filters", () => {
  it("preserves default50/max100 and bounded cursor input", () => {
    expect(staffDirectoryQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(staffDirectoryQuerySchema.parse({ limit: "100" }).limit).toBe(100);
    for (const invalid of [
      { limit: 101 },
      { limit: 0 },
      { offset: 0 },
      { cursor: "x".repeat(513) },
      { cursor: "invalid!" },
    ]) {
      expect(staffDirectoryQuerySchema.safeParse(invalid).success).toBe(false);
    }
  });
  it("normalizes surrounding whitespace and treats blank search as absent", () => {
    expect(
      staffDirectoryQuerySchema.parse({ search: "  أحمد_%  " }).search,
    ).toBe("أحمد_%");
    expect(
      staffDirectoryQuerySchema.parse({ search: " \t " }).search,
    ).toBeUndefined();
    expect(
      staffDirectoryQuerySchema.safeParse({ search: "أ".repeat(201) }).success,
    ).toBe(false);
    expect(
      staffDirectoryQuerySchema.parse({ search: "𐐀".repeat(200) }).search,
    ).toHaveLength(400);
  });
  it("accepts only exact role/status enums, UUID locations and single strings", () => {
    const locationId = "11111111-1111-4111-8111-111111111111";
    expect(
      staffDirectoryQuerySchema.parse({
        role: "VALET_EMPLOYEE",
        status: "INACTIVE",
        locationId,
      }),
    ).toMatchObject({ role: "VALET_EMPLOYEE", status: "INACTIVE", locationId });
    for (const invalid of [
      { role: "CUSTOM" },
      { status: "DISABLED" },
      { locationId: "foreign" },
      { search: ["a", "b"] },
      { organizationId: locationId },
    ]) {
      expect(staffDirectoryQuerySchema.safeParse(invalid).success).toBe(false);
    }
  });
});
