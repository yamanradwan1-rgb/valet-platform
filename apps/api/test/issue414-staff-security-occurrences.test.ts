import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostgresTransaction } from "../src/common/database/postgres";
import { ManagementAccessDeniedError } from "../src/modules/management/management-authorization";
import { authorizeStaffSecurityAlert } from "../src/modules/dashboard/management-alert-sources/administrative-occurrence-authority";
import {
  queryStaffSecurityOccurrences,
  findStaffSecurityOccurrence,
} from "../src/modules/dashboard/management-alert-sources/staff-security-occurrence-reader";

vi.mock(
  "../src/modules/dashboard/management-alert-sources/administrative-occurrence-authority",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../src/modules/dashboard/management-alert-sources/administrative-occurrence-authority")
    >()),
    authorizeStaffSecurityAlert: vi.fn(),
  }),
);

const org = "11111111-1111-4111-8111-111111111111";
const otherSite = "33333333-3333-4333-8333-333333333333";
const member = "44444444-4444-4444-8444-444444444444";
const subject = "55555555-5555-4555-8555-555555555555";
const eventId = "66666666-6666-4666-8666-666666666666";
const context = {
  userId: "77777777-7777-4777-8777-777777777777",
  staffAuthSessionId: "88888888-8888-4888-8888-888888888888",
  createdAt: new Date("2026-11-04T00:00:00Z"),
  accessTokenHash: "staff-access-sha256:v1:test",
};
const when = new Date("2026-11-04T18:00:00Z");

function database(rows: readonly Record<string, unknown>[] = []) {
  const statements: Array<{ sql: string; values: readonly unknown[] }> = [];
  const query = vi.fn(async (sql: string, values: readonly unknown[]) => {
    statements.push({ sql, values });
    if (sql.includes("FROM audit_events"))
      return { rowCount: rows.length, rows };
    throw new Error("Unexpected SQL in staff security occurrence test.");
  });
  return { statements, query, tx: { query } as unknown as PostgresTransaction };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authorizeStaffSecurityAlert).mockResolvedValue(undefined);
});
describe("ALT-15 current Company Admin sensitive staff source", () => {
  it("exposes exactly two committed allowlisted families without private metadata", async () => {
    const db = database([
      {
        eventId,
        targetMembershipId: subject,
        eventType: "STAFF_ROLE_CHANGED",
        occurredAt: when,
      },
      {
        eventId: otherSite,
        targetMembershipId: member,
        eventType: "STAFF_LOCATION_ACCESS_REVOKED",
        occurredAt: when,
      },
    ]);
    const result = await queryStaffSecurityOccurrences(db.tx, {
      context,
      organizationId: org,
      limit: 21,
    });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.title)).toEqual([
      "Staff role changed",
      "Staff location access revoked",
    ]);
    expect(
      result.every(
        (r) =>
          r.locationId === null &&
          r.category === "ALT-15" &&
          r.severity === "IMPORTANT",
      ),
    ).toBe(true);
    const source = db.statements[0]!;
    expect(source.sql).toContain("event.location_id IS NULL");
    expect(source.sql).toContain(
      "event.event_type IN ('STAFF_ROLE_CHANGED','STAFF_LOCATION_ACCESS_REVOKED')",
    );
    expect(source.sql).toContain(
      "event.metadata_json->>'previousRole' <> event.metadata_json->>'newRole'",
    );
    expect(source.sql).toContain("event.metadata_json->>'locationCount'");
    expect(source.sql).not.toContain("SELECT event.metadata_json");
    expect(source.sql).toContain("statement_timestamp()-INTERVAL '7 days'");
    expect(source.values).toEqual([org, 21, context.userId]);
    expect(source.sql).toContain("NOT EXISTS");
    expect(source.sql).toContain("management_alert_seen_receipts");
    expect(source.sql).toContain("seen.category='ALT-15'");
    expect(source.sql.indexOf("NOT EXISTS")).toBeLessThan(
      source.sql.indexOf("ORDER BY"),
    );
  });

  it("denies rejected source authority before source selection", async () => {
    const db = database();
    vi.mocked(authorizeStaffSecurityAlert).mockRejectedValueOnce(
      new ManagementAccessDeniedError(),
    );
    await expect(
      queryStaffSecurityOccurrences(db.tx, {
        context,
        organizationId: org,
        limit: 21,
      }),
    ).rejects.toBeInstanceOf(ManagementAccessDeniedError);
    expect(db.statements).toHaveLength(0);
    vi.mocked(authorizeStaffSecurityAlert).mockRejectedValueOnce(
      new ManagementAccessDeniedError(),
    );
    await expect(
      queryStaffSecurityOccurrences(db.tx, {
        context,
        organizationId: org,
        limit: 21,
      }),
    ).rejects.toBeInstanceOf(ManagementAccessDeniedError);
    expect(vi.mocked(authorizeStaffSecurityAlert)).toHaveBeenCalledTimes(2);
  });

  it("rechecks exact event identity instead of opening an audit page", async () => {
    const db = database([
      {
        eventId,
        targetMembershipId: subject,
        eventType: "STAFF_ROLE_CHANGED",
        occurredAt: when,
      },
    ]);
    const exact = await findStaffSecurityOccurrence(db.tx, {
      context,
      organizationId: org,
      eventId,
    });
    expect(exact?.eventId).toBe(eventId);
    expect(db.statements[0]?.sql).toContain("event.id=$3::uuid");
    expect(db.statements[0]?.sql).not.toContain(
      "management_alert_seen_receipts",
    );
    expect(db.statements[0]?.values).toEqual([org, 1, eventId]);
  });

  it("rejects invalid event UUID and excessive limit before any auth/SQL", async () => {
    const db = database();
    await expect(
      findStaffSecurityOccurrence(db.tx, {
        context,
        organizationId: org,
        eventId: "not-an-id",
      }),
    ).rejects.toBeInstanceOf(ManagementAccessDeniedError);
    await expect(
      queryStaffSecurityOccurrences(db.tx, {
        context,
        organizationId: org,
        limit: 22,
      }),
    ).rejects.toBeInstanceOf(RangeError);
    expect(db.statements).toHaveLength(0);
    expect(vi.mocked(authorizeStaffSecurityAlert)).not.toHaveBeenCalled();
  });
});
