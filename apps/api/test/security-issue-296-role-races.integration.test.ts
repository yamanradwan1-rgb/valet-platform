import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAssignTaskCommandExecutor } from "../src/modules/dispatch/assign-task-command";
import { createReassignTaskCommandExecutor } from "../src/modules/dispatch/reassign-task-command";
import { createOverrideHandoffExecutor } from "../src/modules/retrieval/override-handoff-command";
import { DispatchTestContext } from "./dispatch-test-context";
import { HandoffTestContext } from "./handoff-test-context";
import {
  commandCompletesAheadOfBlockedDemotion,
  commitDemotionAheadOfBlockedCommand,
} from "./security-issue-296-demotion-barrier";

const handoff = new HandoffTestContext("issue296_locked_role_handoff");
const dispatch = new DispatchTestContext("issue296_locked_role_dispatch");

beforeAll(async () => {
  await handoff.setup();
  await dispatch.setup();
}, 120_000);

afterAll(async () => {
  await handoff.teardown();
  await dispatch.teardown();
}, 90_000);

describe("Issue #296 committed demotion wins the protected role lock", () => {
  it("denies former Supervisor handoff override without evidence or custody mutation", async () => {
    const fixture = await handoff.createHandoffFixture();
    await handoff.initiate(fixture);
    const actor = await handoff.addMember(fixture, "VALET_SUPERVISOR");
    const result = await commitDemotionAheadOfBlockedCommand(
      handoff, actor.membershipId,
      () => handoff.overrideHandoff(fixture, actor.userId, 8),
    );
    expect(result).toMatchObject({ succeeded: false, error: { code: "HANDOFF_OVERRIDE_NOT_ALLOWED" } });
    const effects = await handoff.handoffEffects(fixture);
    expect(effects.projection).toMatchObject({ session_state: "HANDOFF_PENDING", session_version: 8 });
    expect(effects.verifications.filter((proof) => proof.method === "SUPERVISOR_OVERRIDE")).toHaveLength(0);
    expect(effects.audits.filter((event) => event.event_type === "HANDOFF_SUPERVISOR_OVERRIDE")).toHaveLength(0);
  }, 90_000);

  it("denies former Supervisor non-assignee abort without changing handoff", async () => {
    const fixture = await handoff.createHandoffFixture();
    await handoff.initiate(fixture);
    const actor = await handoff.addMember(fixture, "VALET_SUPERVISOR");
    const result = await commitDemotionAheadOfBlockedCommand(
      handoff, actor.membershipId,
      () => handoff.abort(fixture, actor.userId),
    );
    expect(result).toMatchObject({ succeeded: false, error: { code: "HANDOFF_OVERRIDE_NOT_ALLOWED" } });
    const effects = await handoff.handoffEffects(fixture);
    expect(effects.projection).toMatchObject({ session_state: "HANDOFF_PENDING", session_version: 8 });
    expect(effects.audits.filter((event) => event.event_type === "VALET_SESSION_HANDOFF_ABORTED")).toHaveLength(0);
  }, 90_000);

  it("denies stale Supervisor assignment of another employee", async () => {
    const fixture = await dispatch.createDispatchFixture({ role: "VALET_SUPERVISOR" });
    const target = await dispatch.addMember(fixture);
    const task = await dispatch.queue(fixture);
    const result = await commitDemotionAheadOfBlockedCommand(
      dispatch, fixture.membershipId,
      () => createAssignTaskCommandExecutor(dispatch.runtimePool)({
        authenticatedUserId: fixture.userId,
        expectedVersion: 1,
        targetAssigneeMembershipId: target.membershipId,
        taskId: task.taskId,
      }),
    );
    expect(result).toMatchObject({ succeeded: false, error: { code: "TASK_ASSIGNMENT_CONFLICT" } });
    const events = await dispatch.dispatchEvents(task.taskId);
    expect(events.map((event) => event.event_type)).toEqual(["QUEUED"]);
    expect(await dispatch.taskAuditEvents(task.taskId)).toHaveLength(0);
  }, 90_000);

  it("denies stale Supervisor reassignment while preserving existing owner", async () => {
    const fixture = await dispatch.createDispatchFixture({ role: "VALET_SUPERVISOR" });
    const currentOwner = await dispatch.addMember(fixture);
    const target = await dispatch.addMember(fixture);
    const task = await dispatch.queue(fixture);
    await createAssignTaskCommandExecutor(dispatch.runtimePool)({
      authenticatedUserId: fixture.userId, expectedVersion: 1,
      targetAssigneeMembershipId: currentOwner.membershipId, taskId: task.taskId,
    });
    const result = await commitDemotionAheadOfBlockedCommand(
      dispatch, fixture.membershipId,
      () => createReassignTaskCommandExecutor(dispatch.runtimePool)({
        authenticatedUserId: fixture.userId, expectedVersion: 2,
        reason: "Test reassignment", targetAssigneeMembershipId: target.membershipId,
        taskId: task.taskId,
      }),
    );
    expect(result).toMatchObject({ succeeded: false, error: { code: "TASK_NOT_FOUND_OR_FORBIDDEN" } });
    const events = await dispatch.dispatchEvents(task.taskId);
    expect(events.map((event) => event.event_type)).toEqual(["QUEUED", "ASSIGNED"]);
    expect(await dispatch.taskAuditEvents(task.taskId)).toHaveLength(1);
  }, 90_000);

  it("permits serialized Supervisor override before a later demotion", async () => {
    const fixture = await handoff.createHandoffFixture();
    await handoff.initiate(fixture);
    const supervisor = await handoff.addMember(fixture, "VALET_SUPERVISOR");
    await commandCompletesAheadOfBlockedDemotion(
      { adminPool: handoff.adminPool, runtimePool: handoff.runtimePool },
      supervisor.membershipId,
      (pool) => createOverrideHandoffExecutor(pool)({
        authenticatedUserId: supervisor.userId,
        expectedSessionVersion: 8,
        reason: "Verified guest at desk",
        sessionId: fixture.sessionId,
      }),
    );
    const effects = await handoff.handoffEffects(fixture);
    expect(effects.projection).toMatchObject({ session_state: "HANDOFF_PENDING", session_version: 9 });
    expect(effects.verifications.filter((proof) => proof.method === "SUPERVISOR_OVERRIDE")).toHaveLength(1);
    expect(effects.audits.filter((event) => event.event_type === "HANDOFF_SUPERVISOR_OVERRIDE")).toHaveLength(1);
    const role = await handoff.adminPool.query<{ role: string }>(
      "SELECT role::text FROM organization_memberships WHERE id = $1",
      [supervisor.membershipId],
    );
    expect(role.rows[0]?.role).toBe("VALET_EMPLOYEE");
  }, 90_000);

  it("preserves legitimate employee self-claim and owner abort", async () => {
    const taskOwner = await dispatch.createDispatchFixture({ role: "VALET_EMPLOYEE" });
    const queued = await dispatch.queue(taskOwner);
    await expect(createAssignTaskCommandExecutor(dispatch.runtimePool)({
      authenticatedUserId: taskOwner.userId, expectedVersion: 1, taskId: queued.taskId,
    })).resolves.toMatchObject({
      currentAssigneeMembershipId: taskOwner.membershipId, status: "ASSIGNED", version: 2,
    });
    const handoffOwner = await handoff.createHandoffFixture();
    await handoff.initiate(handoffOwner);
    await expect(handoff.abort(handoffOwner)).resolves.toMatchObject({
      sessionVersion: 9, state: "READY",
    });
  }, 90_000);
});
