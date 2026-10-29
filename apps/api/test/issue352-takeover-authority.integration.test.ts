import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createEmergencyTakeoverCommandExecutor } from "../src/modules/dispatch/emergency-takeover-command";
import { Issue352TakeoverTestContext } from "./issue352-takeover-test-context";

const context = new Issue352TakeoverTestContext("authority");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

const execute = () => createEmergencyTakeoverCommandExecutor(context.runtimePool);

describe("Issue #352 real PostgreSQL role and session authority", () => {
  it("allows an ORG_ADMIN with fresh MFA but without an operational Shift", async () => {
    const source = await context.parking();
    const { admin, replacement } = await context.actors(source);
    const request = await context.request(source, admin, replacement);
    const shifts = await context.adminPool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM shifts WHERE membership_id = $1`,
      [admin.membershipId],
    );
    expect(shifts.rows[0]?.count).toBe(0);
    const result = await execute()({
      ...request,
      staffSessionContext: await context.credential(admin.userId, true),
    });
    expect(result.task.assigneeMembershipId).toBe(replacement.membershipId);
  });

  it("rejects an ORG_ADMIN without fresh MFA without touching the Task", async () => {
    const source = await context.parking();
    const { admin, replacement } = await context.actors(source);
    const request = await context.request(source, admin, replacement);
    const before = await context.snapshot(source.taskId);
    await expect(execute()(request))
      .rejects.toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
    expect(await context.snapshot(source.taskId)).toEqual(before);
  });

  it("rejects stale sensitive MFA even when the session remains active", async () => {
    const source = await context.parking();
    const { admin, replacement } = await context.actors(source);
    const request = await context.request(source, admin, replacement);
    const staffSessionContext = await context.credential(admin.userId, true);
    const aged = await context.adminPool.query<{ created_at: Date }>(
      `UPDATE staff_auth_sessions
       SET created_at = created_at - interval '6 minutes',
           mfa_authenticated_at = mfa_authenticated_at - interval '6 minutes'
       WHERE id = $1 RETURNING created_at`,
      [staffSessionContext.staffAuthSessionId],
    );
    const before = await context.snapshot(source.taskId);
    await expect(execute()({ ...request, staffSessionContext: {
      ...staffSessionContext, createdAt: aged.rows[0]!.created_at,
    } }))
      .rejects.toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
    expect(await context.snapshot(source.taskId)).toEqual(before);
  });

  it.each(["VALET_EMPLOYEE", "LOCATION_MANAGER"] as const)(
    "denies initiator role %s without an emergency event", async (role) => {
      const source = await context.parking();
      const initiator = await context.addMember(source, role, role !== "LOCATION_MANAGER");
      const replacement = await context.addMember(source);
      const before = await context.snapshot(source.taskId);
      await expect(execute()(await context.request(source, initiator, replacement)))
        .rejects.toMatchObject({ code: "TASK_NOT_FOUND_OR_FORBIDDEN" });
      expect(await context.snapshot(source.taskId)).toEqual(before);
    },
  );

  it("hides a cross-tenant Task from a valid other-Organization Supervisor", async () => {
    const source = await context.parking();
    const other = await context.createDispatchFixture({ role: "VALET_SUPERVISOR" });
    const replacement = await context.addMember(source);
    const before = await context.snapshot(source.taskId);
    await expect(execute()(await context.request(source, other, replacement)))
      .rejects.toMatchObject({ code: "TASK_NOT_FOUND_OR_FORBIDDEN" });
    expect(await context.snapshot(source.taskId)).toEqual(before);
  });

  it("denies a Supervisor whose exact Location grant was revoked", async () => {
    const source = await context.parking();
    const { initiator, replacement } = await context.actors(source);
    const request = await context.request(source, initiator, replacement);
    await context.adminPool.query(
      `DELETE FROM membership_location_access
       WHERE membership_id = $1 AND location_id = $2`,
      [initiator.membershipId, source.locationId],
    );
    const before = await context.snapshot(source.taskId);
    await expect(execute()(request))
      .rejects.toMatchObject({ code: "TASK_NOT_FOUND_OR_FORBIDDEN" });
    expect(await context.snapshot(source.taskId)).toEqual(before);
  });

  it("denies a revoked Staff session even with an eligible Shift", async () => {
    const source = await context.parking();
    const { initiator, replacement } = await context.actors(source);
    const request = await context.request(source, initiator, replacement);
    await context.adminPool.query(
      `UPDATE staff_auth_sessions SET revoked_at = clock_timestamp()
       WHERE id = $1`, [request.staffSessionContext.staffAuthSessionId],
    );
    const before = await context.snapshot(source.taskId);
    await expect(execute()(request))
      .rejects.toMatchObject({ status: 401 });
    expect(await context.snapshot(source.taskId)).toEqual(before);
  });

  it("denies a replacement employee without an active exact-Location Shift", async () => {
    const source = await context.parking();
    const initiator = await context.addMember(source, "VALET_SUPERVISOR");
    const replacement = await context.addMember(source, "VALET_EMPLOYEE", false);
    const before = await context.snapshot(source.taskId);
    await expect(execute()(await context.request(source, initiator, replacement)))
      .rejects.toMatchObject({ code: "TASK_ASSIGNEE_NOT_ELIGIBLE" });
    expect(await context.snapshot(source.taskId)).toEqual(before);
  });

  it("denies an ORG_ADMIN as replacement field assignee", async () => {
    const source = await context.parking();
    const { initiator, admin } = await context.actors(source);
    const before = await context.snapshot(source.taskId);
    await expect(execute()(await context.request(source, initiator, admin)))
      .rejects.toMatchObject({ code: "TASK_ASSIGNEE_NOT_ELIGIBLE" });
    expect(await context.snapshot(source.taskId)).toEqual(before);
  });

  it("recovers when A's Shift has already ended", async () => {
    const source = await context.parking();
    const { initiator, replacement } = await context.actors(source);
    await context.adminPool.query(
      `UPDATE shifts SET status = 'ENDED', ended_at = clock_timestamp()
       WHERE membership_id = $1`, [source.membershipId],
    );
    const result = await execute()(await context.request(source, initiator, replacement));
    expect(result.task.assigneeMembershipId).toBe(replacement.membershipId);
  });

  it.each([" ", "reason\nwith newline", "x".repeat(501)])(
    "rejects an invalid mandatory reason (%s)", async (reason) => {
      const source = await context.parking();
      const { initiator, replacement } = await context.actors(source);
      const before = await context.snapshot(source.taskId);
      await expect(execute()(await context.request(source, initiator, replacement, reason)))
        .rejects.toMatchObject({ code: "EMERGENCY_TAKEOVER_REASON_INVALID" });
      expect(await context.snapshot(source.taskId)).toEqual(before);
    },
  );
});
