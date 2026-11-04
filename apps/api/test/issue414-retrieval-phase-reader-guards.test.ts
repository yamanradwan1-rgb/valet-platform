import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import { lockAndRecheckStaffSessionContext } from "../src/modules/auth/staff-session-revalidation";
import { authorizeDashboardReadLocation } from "../src/modules/dashboard/dashboard-read-authorization";
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

function fixtureTransaction(rows: Record<string, unknown>[] = []) {
  const calls: { readonly sql: string; readonly args?: readonly unknown[] }[] = [];
  const tx = {
    query: vi.fn(async (sql: string, args?: readonly unknown[]) => {
      calls.push(args === undefined ? { sql } : { sql, args });
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
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toContain("task.id=$7::uuid");
    expect(calls[0]!.sql).toContain("proof.total=1 AND proof.valid=1");
    expect(calls[0]!.sql).toContain("event_proof.matches=1");
    expect(calls[0]!.sql).toContain("request.sla_target_seconds_snapshot");
    expect(calls[0]!.args?.at(-1)).toBe(sourceId);
    expect(calls[0]!.args?.[3]).toBe(1);
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
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toContain("proof.total=1 AND proof.valid=1");
    expect(calls[0]!.sql).toContain("session.ready_at > $5::timestamptz");
    expect(calls[0]!.sql).toContain("audit.event_type='VALET_SESSION_READY'");
    expect(calls[0]!.args?.at(-1)).toBe(sourceId);
  });
});
