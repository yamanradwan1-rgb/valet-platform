import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import { lockAndRecheckStaffSessionContext } from "../src/modules/auth/staff-session-revalidation";
import { authorizeDashboardReadLocation } from "../src/modules/dashboard/dashboard-read-authorization";
import { requireManagementAlertClockCutover } from "../src/modules/dashboard/management-alert-clock-cutover";
import {
  findRetrievalStageAlertCaseById,
  queryRetrievalStageAlertCases,
} from "../src/modules/dashboard/management-alert-sources/retrieval-stage-alert-reader";
import {
  findRetrievalReadyAlertCaseById,
  queryRetrievalReadyAlertCases,
} from "../src/modules/dashboard/management-alert-sources/retrieval-ready-alert-reader";
import type { RetrievalPhaseAlertInput } from "../src/modules/dashboard/management-alert-sources/retrieval-phase-alert-types";

vi.mock("../src/modules/dashboard/dashboard-read-authorization", () => ({
  authorizeDashboardReadLocation: vi.fn(),
}));
vi.mock("../src/modules/auth/staff-session-revalidation", () => ({
  lockAndRecheckStaffSessionContext: vi.fn(),
}));
vi.mock("../src/modules/dashboard/management-alert-clock-cutover", () => ({
  requireManagementAlertClockCutover: vi.fn(),
}));

const sourceId = "11111111-1111-4111-8111-111111111111";
const input: RetrievalPhaseAlertInput & { readonly alt01GraceSeconds: number } = {
  context: {
    userId: "current-user", staffAuthSessionId: "session-token",
    accessTokenHash: "protected-hash", createdAt: new Date("2026-11-04"),
  },
  scope: { organizationId: "org", locationId: "location", membershipId: "lm" },
  limit: 21, delaySeconds: 300, alt01GraceSeconds: 0,
  postLockClockCutover: new Date("2026-11-04T13:00:00.000Z"),
};
const staff = vi.mocked(lockAndRecheckStaffSessionContext);
const authorized = vi.mocked(authorizeDashboardReadLocation);
const cutover = vi.mocked(requireManagementAlertClockCutover);

function fixtureTransaction(
  rows: Record<string, unknown>[] = [],
  sourceReadAllowed = true,
) {
  const calls: { readonly sql: string; readonly args?: readonly unknown[] }[] = [];
  const tx = {
    query: vi.fn(async (sql: string, args?: readonly unknown[]) => {
      calls.push(args === undefined ? { sql } : { sql, args });
      if (sql.includes('AS "sourceReadAllowed"')) {
        return { rows: [{ sourceReadAllowed }], rowCount: 1 };
      }
      return { rows, rowCount: rows.length };
    }),
  } as unknown as PostgresTransaction;
  return { tx, calls };
}

beforeEach(() => {
  vi.resetAllMocks();
  staff.mockResolvedValue({
    id: input.context.staffAuthSessionId,
    user_id: input.context.userId,
    created_at: input.context.createdAt,
  });
  authorized.mockResolvedValue(input.scope);
  cutover.mockReturnValue(input.postLockClockCutover);
});

describe("Issue #414 P2 restricted source-reader boundaries", () => {
  it("rejects invalid personal timing or absent authoritative cutover before SQL", async () => {
    const { tx, calls } = fixtureTransaction();
    for (const invalid of [
      { delaySeconds: 59 }, { delaySeconds: 901 },
      { delaySeconds: Number.NaN }, { limit: 22 },
      { alt01GraceSeconds: 61 },
      { postLockClockCutover: new Date(Number.NaN) },
      { postLockClockCutover: undefined },
      { postLockClockCutover: new Date("2026-11-04T13:00:00.001Z") },
    ]) {
      // Runtime validation must reject malformed JS callers despite static types.
      const unsafe = { ...input, ...invalid } as RetrievalPhaseAlertInput & {
        readonly alt01GraceSeconds: number;
      };
      await expect(queryRetrievalStageAlertCases(tx, unsafe))
        .rejects.toThrow();
      await expect(queryRetrievalReadyAlertCases(tx, unsafe))
        .rejects.toThrow();
    }
    expect(calls).toHaveLength(0);
    expect(staff).not.toHaveBeenCalled();
  });

  it("rejects unset or unproven server release clock even for a finite Date", async () => {
    const { tx, calls } = fixtureTransaction();
    cutover.mockImplementationOnce(() => {
      throw new Error("Management alert Dispatch source-clock cutover is unavailable.");
    });
    await expect(queryRetrievalStageAlertCases(tx, input))
      .rejects.toThrow("unavailable");
    cutover.mockImplementationOnce(() => {
      throw new Error("Management alert Dispatch source-clock cutover is unavailable.");
    });
    await expect(queryRetrievalReadyAlertCases(tx, input))
      .rejects.toThrow("unavailable");
    expect(calls).toHaveLength(0);
  });

  it("rejects expired Staff session and revoked exact Location before source rows", async () => {
    const { tx, calls } = fixtureTransaction();
    staff.mockResolvedValue(undefined);
    await expect(queryRetrievalStageAlertCases(tx, input))
      .rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(queryRetrievalReadyAlertCases(tx, input))
      .rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(authorized).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);

    staff.mockResolvedValue({
      id: input.context.staffAuthSessionId,
      user_id: input.context.userId,
      created_at: input.context.createdAt,
    });
    authorized.mockResolvedValue(null);
    await expect(queryRetrievalStageAlertCases(tx, input))
      .rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(queryRetrievalReadyAlertCases(tx, input))
      .rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(calls).toHaveLength(0);
  });

  it("always checks live session/authority before exact source and bounds SQL", async () => {
    const { tx, calls } = fixtureTransaction([{
      sourceId, episodeId: `${sourceId}:4`,
      occurredAt: new Date("2026-11-04T12:00:00.000Z"),
    }]);
    expect(await findRetrievalStageAlertCaseById(tx, input,
      sourceId, `${sourceId}:4`)).toMatchObject({
      category: "ALT-04", sourceId, severity: "IMPORTANT",
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.sql).toContain("membership_location_access");
    expect(calls[0]!.sql).toContain("dashboard_access_enabled=TRUE");
    expect(calls[0]!.sql).toContain("viewer.role='LOCATION_MANAGER'");
    expect(calls[0]!.args).toEqual(["org", "location", "lm", "current-user"]);
    expect(calls[1]!.sql).toContain("task.id=$7::uuid");
    expect(calls[1]!.sql).toContain("proof.total=1 AND proof.valid=1");
    expect(calls[1]!.sql).toContain("event_proof.matches=1");
    expect(calls[1]!.sql).toContain("request.sla_target_seconds_snapshot");
    expect(calls[1]!.args?.at(-1)).toBe(sourceId);
    expect(calls[1]!.args?.[3]).toBe(1);
    expect(authorized).toHaveBeenCalledWith(tx, expect.objectContaining({
      recordActivity: false, staffSessionContext: input.context,
    }));
  });

  it("requires original audited READY episode without UUID-based ordering", async () => {
    const { tx, calls } = fixtureTransaction([{
      sourceId, episodeId: "22222222-2222-4222-8222-222222222222",
      occurredAt: new Date("2026-11-04T12:00:00.000Z"),
    }]);
    expect(await findRetrievalReadyAlertCaseById(tx, input,
      sourceId, "22222222-2222-4222-8222-222222222222"))
      .toMatchObject({ category: "ALT-06", sourceKind: "RETRIEVAL" });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.sql).toContain("proof.total=1 AND proof.valid=1");
    expect(calls[1]!.sql).toContain("session.ready_at > $5::timestamptz");
    expect(calls[1]!.sql).toContain("audit.event_type='VALET_SESSION_READY'");
    expect(calls[1]!.sql).toContain("ELSE FALSE END");
    expect(calls[1]!.sql).toContain("::bigint + 1");
    expect(calls[1]!.sql).not.toContain("::integer-1");
    expect(calls[1]!.args?.at(-1)).toBe(sourceId);
  });

  it("denies a LM with a valid exact Dashboard grant but without owning source-read eligibility", async () => {
    const { tx, calls } = fixtureTransaction([], false);
    await expect(queryRetrievalStageAlertCases(tx, input))
      .rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(queryRetrievalReadyAlertCases(tx, input))
      .rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(authorized).toHaveBeenCalledTimes(2);
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.sql.includes('AS "sourceReadAllowed"')))
      .toBe(true);
  });

  it("rejects CA without current MFA before any owning Task/Session source probe", async () => {
    const { tx, calls } = fixtureTransaction();
    authorized.mockRejectedValueOnce(new Error("MFA_STEP_UP_REQUIRED"));
    await expect(queryRetrievalStageAlertCases(tx, input))
      .rejects.toThrow("MFA_STEP_UP_REQUIRED");
    authorized.mockRejectedValueOnce(new Error("MFA_STEP_UP_REQUIRED"));
    await expect(queryRetrievalReadyAlertCases(tx, input))
      .rejects.toThrow("MFA_STEP_UP_REQUIRED");
    expect(calls).toHaveLength(0);
  });
});
