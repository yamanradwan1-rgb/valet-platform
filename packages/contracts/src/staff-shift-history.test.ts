import { describe, expect, it } from "vitest";
import {
  staffShiftHistoryQuerySchema,
  staffShiftHistoryEntrySchema,
  staffShiftHistoryResponseSchema,
  staffShiftEmployeeQuerySchema,
} from "./staff-shift-history.js";

const id = "60000000-0000-4000-8000-000000000001";
const entry = {
  shiftId: id,
  membershipId: id,
  identity: {
    firstName: "أحمد",
    lastName: "O’Connor",
    email: "staff@example.com",
  },
  currentRole: "VALET_EMPLOYEE",
  location: {
    locationId: id,
    name: "Hotel",
    code: "H",
    timezone: "Asia/Amman",
  },
  status: "ACTIVE",
  startedAt: "2026-10-01T05:00:00.000Z",
  endedAt: null,
};

describe("staff shift history public contracts", () => {
  it("defaults to a bounded all-status page and accepts offset instants", () => {
    expect(staffShiftHistoryQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(
      staffShiftHistoryQuerySchema.parse({
        from: "2026-10-01T08:00:00+03:00",
        to: "2026-10-02T05:00:00Z",
        limit: "100",
      }).limit,
    ).toBe(100);
  });
  it.each([
    { limit: 0 },
    { limit: 101 },
    { status: "INACTIVE" },
    { from: "2026-10-01" },
    { from: "2026-10-01T05:00:00" },
    { unexpected: true },
    { membershipId: "bad" },
    { from: "2026-10-01T05:00:00Z", to: "2026-10-01T08:00:00+03:00" },
    { from: "2026-10-02T05:00:00Z", to: "2026-10-01T05:00:00Z" },
  ])("rejects invalid query %j", (query) => {
    expect(staffShiftHistoryQuerySchema.safeParse(query).success).toBe(false);
  });
  it("uses the canonical nullable identity and truthfully current role", () => {
    expect(staffShiftHistoryEntrySchema.parse(entry)).toEqual(entry);
    expect(
      staffShiftHistoryEntrySchema.safeParse({
        ...entry,
        identity: {
          firstName: null,
          lastName: null,
          email: "legacy@example.com",
        },
        currentRole: "ORG_ADMIN",
      }).success,
    ).toBe(true);
    expect(
      staffShiftHistoryEntrySchema.safeParse({
        ...entry,
        roleAtShift: "VALET_EMPLOYEE",
      }).success,
    ).toBe(false);
  });
  it("requires endedAt consistency and a valid nonnegative ended interval", () => {
    expect(
      staffShiftHistoryEntrySchema.safeParse({
        ...entry,
        endedAt: entry.startedAt,
      }).success,
    ).toBe(false);
    expect(
      staffShiftHistoryEntrySchema.safeParse({ ...entry, status: "ENDED" })
        .success,
    ).toBe(false);
    expect(
      staffShiftHistoryEntrySchema.safeParse({
        ...entry,
        status: "ENDED",
        endedAt: "2026-10-01T07:00:00Z",
      }).success,
    ).toBe(true);
  });
  it("bounds strict response pages and excludes arbitrary metadata", () => {
    expect(
      staffShiftHistoryResponseSchema.safeParse({
        items: Array(101).fill(entry),
        nextCursor: null,
      }).success,
    ).toBe(false);
    expect(
      staffShiftHistoryResponseSchema.safeParse({
        items: [],
        nextCursor: null,
        audit: {},
      }).success,
    ).toBe(false);
  });
  it("bounds searchable history employee candidates", () => {
    expect(staffShiftEmployeeQuerySchema.parse({ search: "  أحمد  " })).toEqual(
      { search: "أحمد", limit: 50 },
    );
    expect(
      staffShiftEmployeeQuerySchema.safeParse({ search: "a".repeat(201) })
        .success,
    ).toBe(false);
    expect(
      staffShiftEmployeeQuerySchema.safeParse({ role: "ORG_ADMIN" }).success,
    ).toBe(false);
  });
});
