import { describe, expect, it } from "vitest";
import { staffDirectoryQuerySchema } from "@valet/contracts";
import { ApiTransportValidationError } from "../src/common/http/api-errors";
import {
  decodeStaffDirectoryCursor,
  encodeStaffDirectoryCursor,
  staffDirectoryFilterFingerprint,
} from "../src/modules/management/staff-management-cursor";

const organization = "11111111-1111-4111-8111-111111111111";
const tuple = {
  createdAt: "2026-10-01T00:00:00.000Z",
  membershipId: "22222222-2222-4222-8222-222222222222",
};
const filters = staffDirectoryQuerySchema.parse({
  search: "Private Employee",
  role: "VALET_EMPLOYEE",
  status: "ACTIVE",
  locationId: organization,
});
const fingerprint = staffDirectoryFilterFingerprint(filters);

describe("T05-A directory cursor v2", () => {
  it("binds a deterministic normalized fingerprint without readable search PII", () => {
    expect(
      staffDirectoryFilterFingerprint({
        ...filters,
        search: " Private Employee ",
        limit: 100,
      }),
    ).toBe(fingerprint);
    const cursor = encodeStaffDirectoryCursor(organization, tuple, fingerprint);
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    expect(JSON.parse(decoded)).toMatchObject({
      k: "staff",
      v: 2,
      f: fingerprint,
    });
    expect(decoded).not.toContain("Private");
    expect(decoded).not.toContain("Employee");
    expect(
      decodeStaffDirectoryCursor(organization, cursor, fingerprint),
    ).toEqual(tuple);
  });
  it("keeps Unicode search case distinct rather than assuming PostgreSQL locale folding", () => {
    expect(
      staffDirectoryFilterFingerprint({ ...filters, search: "İ" }),
    ).not.toBe(
      staffDirectoryFilterFingerprint({ ...filters, search: "i\u0307" }),
    );
    expect(
      staffDirectoryFilterFingerprint({
        ...filters,
        search: "Private Employee",
      }),
    ).not.toBe(
      staffDirectoryFilterFingerprint({
        ...filters,
        search: "private employee",
      }),
    );
  });
  it("rejects every changed filter and tenant rather than silently resetting", () => {
    const cursor = encodeStaffDirectoryCursor(organization, tuple, fingerprint);
    for (const change of [
      { search: "other" },
      { role: "ORG_ADMIN" as const },
      { status: "INACTIVE" as const },
      { locationId: tuple.membershipId },
    ]) {
      expect(() =>
        decodeStaffDirectoryCursor(
          organization,
          cursor,
          staffDirectoryFilterFingerprint({ ...filters, ...change }),
        ),
      ).toThrow(ApiTransportValidationError);
    }
    expect(() =>
      decodeStaffDirectoryCursor(tuple.membershipId, cursor, fingerprint),
    ).toThrow(ApiTransportValidationError);
  });
  it("rejects old version, wrong domain, malformed tuple and additional fields", () => {
    const base = JSON.parse(
      Buffer.from(
        encodeStaffDirectoryCursor(organization, tuple, fingerprint),
        "base64url",
      ).toString(),
    ) as Record<string, unknown>;
    for (const change of [
      { v: 1 },
      { k: "other" },
      { c: "invalid" },
      { i: "not-uuid" },
      { extra: "x" },
    ]) {
      const cursor = Buffer.from(
        JSON.stringify({ ...base, ...change }),
      ).toString("base64url");
      expect(() =>
        decodeStaffDirectoryCursor(organization, cursor, fingerprint),
      ).toThrow(ApiTransportValidationError);
    }
  });
});
