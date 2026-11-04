import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostgresTransaction } from "../src/common/database/postgres";
import { lockAndRecheckStaffSessionContext } from "../src/modules/auth/staff-session-revalidation";
import { requireMfaAssuranceInTransaction } from "../src/modules/auth/mfa/mfa-assurance-policy";
import { ManagementAccessDeniedError } from "../src/modules/management/management-authorization";
import { authorizeStaffManagement } from "../src/modules/management/staff-management-authorization";
import {
  queryForcedShiftEndOccurrences,
  findForcedShiftEndOccurrence,
} from "../src/modules/dashboard/management-alert-sources/force-ended-shift-occurrence-reader";

vi.mock("../src/modules/auth/staff-session-revalidation", () => ({
  lockAndRecheckStaffSessionContext: vi.fn(),
}));
vi.mock("../src/modules/auth/mfa/mfa-assurance-policy", () => ({
  requireMfaAssuranceInTransaction: vi.fn(),
}));
vi.mock("../src/modules/management/staff-management-authorization", () => ({
  authorizeStaffManagement: vi.fn(),
}));

const org = "11111111-1111-4111-8111-111111111111";
const site = "22222222-2222-4222-8222-222222222222";
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
    if (sql.includes("SELECT 1 FROM locations")) {
      return { rowCount: 1, rows: [{ "?column?": 1 }] };
    }
    if (sql.includes("FROM audit_events")) {
      return { rowCount: rows.length, rows };
    }
    throw new Error("Unexpected SQL in administrative occurrence test.");
  });
  return { statements, query, tx: { query } as unknown as PostgresTransaction };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(lockAndRecheckStaffSessionContext).mockResolvedValue({
    id: context.staffAuthSessionId,
    user_id: context.userId,
    created_at: context.createdAt,
  });
  vi.mocked(requireMfaAssuranceInTransaction).mockResolvedValue(undefined);
  vi.mocked(authorizeStaffManagement).mockResolvedValue({
    kind: "COMPANY_ADMIN",
    membershipId: member,
    organizationId: org,
    activeLocationIds: null,
    scopeFingerprint: "test",
  });
});

describe("ALT-13 guarded Shift force-end source", () => {
  it("projects only safe persisted event identity and 7-day window", async () => {
    const db = database([{ eventId, shiftId: subject, occurredAt: when }]);
    const input = { context, organizationId: org, locationId: site, limit: 21 };
    const first = await queryForcedShiftEndOccurrences(db.tx, input);
    const retry = await findForcedShiftEndOccurrence(db.tx, {
      ...input,
      eventId,
    });
    expect(first).toEqual([
      {
        category: "ALT-13",
        eventId,
        targetId: subject,
        sourceKind: "SHIFT",
        organizationId: org,
        locationId: site,
        occurredAt: when.toISOString(),
        severity: "IMPORTANT",
        title: "Shift administratively ended",
      },
    ]);
    expect(retry).toEqual(first[0]);
    expect(
      db.statements.filter((s) => s.sql.includes("FROM audit_events")),
    ).toHaveLength(2);
    const source = db.statements.find((s) =>
      s.sql.includes("FROM audit_events"),
    )!;
    expect(source.sql).toContain("shift.status='ENDED'");
    expect(source.sql).toContain("shift.ended_at=event.occurred_at");
    expect(source.sql).toContain("event.event_type='SHIFT_FORCE_ENDED'");
    expect(source.sql).toContain("statement_timestamp()-INTERVAL '7 days'");
    expect(source.sql).not.toMatch(
      /shift_force_end_closures|metadata_json|reason/i,
    );
    expect(source.values).toEqual([org, site, 21]);
    expect(vi.mocked(authorizeStaffManagement)).toHaveBeenCalledTimes(2);
  });

  it("fails closed on revoked LM grant before querying source rows", async () => {
    vi.mocked(authorizeStaffManagement).mockResolvedValue({
      kind: "LOCATION_MANAGER",
      membershipId: member,
      organizationId: org,
      activeLocationIds: [otherSite],
      scopeFingerprint: "test",
    });
    const db = database();
    await expect(
      queryForcedShiftEndOccurrences(db.tx, {
        context,
        organizationId: org,
        locationId: site,
        limit: 21,
      }),
    ).rejects.toBeInstanceOf(ManagementAccessDeniedError);
    expect(db.statements).toHaveLength(0);
  });

  it("requires protected LM MFA before querying any Shift occurrence", async () => {
    vi.mocked(authorizeStaffManagement).mockResolvedValue({
      kind: "LOCATION_MANAGER",
      membershipId: member,
      organizationId: org,
      activeLocationIds: [site],
      scopeFingerprint: "test",
    });
    vi.mocked(requireMfaAssuranceInTransaction).mockRejectedValueOnce(
      new ManagementAccessDeniedError(),
    );
    const db = database();
    await expect(
      queryForcedShiftEndOccurrences(db.tx, {
        context,
        organizationId: org,
        locationId: site,
        limit: 21,
      }),
    ).rejects.toBeInstanceOf(ManagementAccessDeniedError);
    expect(db.statements).toHaveLength(0);
  });

  it("fails closed on role downgrade or invalid session before source query", async () => {
    const db = database();
    vi.mocked(authorizeStaffManagement).mockRejectedValueOnce(
      new ManagementAccessDeniedError(),
    );
    await expect(
      queryForcedShiftEndOccurrences(db.tx, {
        context,
        organizationId: org,
        locationId: site,
        limit: 21,
      }),
    ).rejects.toBeInstanceOf(ManagementAccessDeniedError);
    expect(db.statements).toHaveLength(0);
    vi.mocked(lockAndRecheckStaffSessionContext).mockResolvedValueOnce(
      undefined,
    );
    await expect(
      queryForcedShiftEndOccurrences(db.tx, {
        context,
        organizationId: org,
        locationId: site,
        limit: 21,
      }),
    ).rejects.toBeInstanceOf(ManagementAccessDeniedError);
    expect(db.statements).toHaveLength(0);
  });
});
