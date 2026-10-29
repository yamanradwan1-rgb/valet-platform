import { UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostgresTransaction } from "../src/common/database/postgres";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";

vi.mock("../src/modules/auth/staff-session-revalidation", () => ({
  lockAndRecheckStaffSessionContext: vi.fn(),
}));
vi.mock("../src/modules/auth/mfa/mfa-assurance-policy", () => ({
  requireMfaAssuranceInTransaction: vi.fn(),
  recordAdminActivityInTransaction: vi.fn(),
}));

import { lockAndRecheckStaffSessionContext } from "../src/modules/auth/staff-session-revalidation";
import {
  recordAdminActivityInTransaction,
  requireMfaAssuranceInTransaction,
} from "../src/modules/auth/mfa/mfa-assurance-policy";
import { authorizeEmergencyTakeoverRead } from "../src/modules/dispatch/emergency-task-takeover.authority";

const context: StaffSessionContext = {
  accessTokenHash: "hash",
  createdAt: new Date("2026-10-29T12:00:00Z"),
  staffAuthSessionId: "session-id",
  userId: "current-user",
};
const task = {
  id: "task-id",
  organizationId: "task-organization",
  locationId: "task-location",
  sessionId: "valet-session-id",
  taskType: "RETRIEVAL",
  status: "IN_PROGRESS",
  version: 7,
  assigneeMembershipId: "employee-a",
  sessionState: "HANDOFF_PENDING",
};

function database(input: {
  hintFound?: boolean;
  taskFound?: boolean;
  sessionFound?: boolean;
  role?: string;
  grantAndShift?: boolean;
} = {}) {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM tasks WHERE id = $1")) {
        const rows = input.hintFound === false ? [] : [{
          organizationId: task.organizationId,
          locationId: task.locationId,
          sessionId: task.sessionId,
        }];
        return { rows, rowCount: rows.length };
      }
      if (sql.includes("FROM valet_sessions") && sql.includes("FOR SHARE")) {
        const rows = input.sessionFound === false ? [] : [{ exists: true }];
        return { rows, rowCount: rows.length };
      }
      if (sql.includes("FROM tasks AS task")) {
        const rows = input.taskFound === false ? [] : [task];
        return { rows, rowCount: rows.length };
      }
      if (sql.includes("FROM organization_memberships AS membership")) {
        const rows = input.role === "NONE"
          ? []
          : [{ membershipId: "actor-membership", role: input.role ?? "VALET_SUPERVISOR" }];
        return { rows, rowCount: rows.length };
      }
      if (sql.includes("FROM membership_location_access AS access")) {
        const rows = input.grantAndShift === false ? [] : [{ authorized: true }];
        return { rows, rowCount: rows.length };
      }
      throw new Error("Unexpected authorization query");
  });
  const transaction = { query } as unknown as PostgresTransaction;
  return { transaction, calls, query };
}

describe("Emergency takeover scoped Task Details authority", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(lockAndRecheckStaffSessionContext).mockResolvedValue({
      id: context.staffAuthSessionId,
      user_id: context.userId,
      created_at: context.createdAt,
    });
    vi.mocked(requireMfaAssuranceInTransaction).mockResolvedValue(undefined);
    vi.mocked(recordAdminActivityInTransaction).mockResolvedValue(undefined);
  });

  it("allows an active supervisor only through the exact Task location grant and Shift", async () => {
    const { transaction, calls, query } = database();
    const scope = await authorizeEmergencyTakeoverRead(transaction, context, task.id);
    expect(scope).toMatchObject({
      taskId: task.id,
      organizationId: task.organizationId,
      locationId: task.locationId,
      actorMembershipId: "actor-membership",
      sessionState: "HANDOFF_PENDING",
    });
    expect(calls[1]?.params).toEqual([
      task.sessionId, task.organizationId, task.locationId,
    ]);
    expect(calls[3]?.params).toEqual([task.organizationId, context.userId]);
    expect(calls[4]?.params).toEqual([
      task.organizationId, task.locationId, "actor-membership",
    ]);
    expect(calls[1]?.sql).toContain("FOR SHARE");
    const staffSessionCheckOrder =
      vi.mocked(lockAndRecheckStaffSessionContext).mock.invocationCallOrder[0]!;
    expect(query.mock.invocationCallOrder[1]).toBeLessThan(staffSessionCheckOrder);
    expect(query.mock.invocationCallOrder[2]).toBeGreaterThan(staffSessionCheckOrder);
    expect(requireMfaAssuranceInTransaction).not.toHaveBeenCalled();
    expect(recordAdminActivityInTransaction).not.toHaveBeenCalled();
  });

  it("allows ORG_ADMIN without operational Shift but requires sensitive current MFA", async () => {
    const { transaction, calls } = database({ role: "ORG_ADMIN" });
    await authorizeEmergencyTakeoverRead(transaction, context, task.id);
    expect(calls).toHaveLength(4);
    expect(requireMfaAssuranceInTransaction).toHaveBeenCalledWith(
      transaction, context, { sensitive: true },
    );
    expect(recordAdminActivityInTransaction).toHaveBeenCalledWith(
      transaction, context,
    );
  });

  it.each([
    { role: "LOCATION_MANAGER" },
    { role: "VALET_EMPLOYEE" },
    { role: "NONE" },
    { hintFound: false },
    { sessionFound: false },
    { taskFound: false },
    { role: "VALET_SUPERVISOR", grantAndShift: false },
  ])("conceals an unauthorized Task/scope: %j", async (input) => {
    const { transaction } = database(input);
    await expect(authorizeEmergencyTakeoverRead(transaction, context, task.id))
      .rejects.toMatchObject({ code: "TASK_NOT_FOUND_OR_FORBIDDEN" });
  });

  it("does not trust a previously resolved bearer after session revocation", async () => {
    vi.mocked(lockAndRecheckStaffSessionContext).mockResolvedValue(undefined);
    const { transaction, calls } = database();
    await expect(authorizeEmergencyTakeoverRead(transaction, context, task.id))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.sql).toContain("valet_sessions");
  });

  it("keeps MFA step-up failures separate from concealed foreign-Task responses", async () => {
    vi.mocked(requireMfaAssuranceInTransaction).mockRejectedValue(
      Object.assign(new Error("step up"), { code: "MFA_STEP_UP_REQUIRED" }),
    );
    const { transaction } = database({ role: "ORG_ADMIN" });
    await expect(authorizeEmergencyTakeoverRead(transaction, context, task.id))
      .rejects.toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
  });
});
