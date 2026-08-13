import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CompleteHandoffTestContext } from "./complete-handoff-test-context";

const context = new CompleteHandoffTestContext("command");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-006G complete handoff command", () => {
  it("atomically releases a pickup-code handoff and closes every projection", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    const before = await context.releaseEffects(fixture);
    const result = await context.complete(fixture);
    const after = await context.releaseEffects(fixture);

    expect(result).toEqual({
      retrievalRequestStatus: "COMPLETED",
      sessionId: fixture.sessionId,
      sessionVersion: 10,
      state: "COMPLETED",
      taskId: fixture.retrievalTaskId,
      taskStatus: "COMPLETED",
      taskVersion: 5,
    });
    expect(after.projection).toMatchObject({
      completed_by_membership_id: fixture.membershipId,
      key_slot_id: null,
      request_status: "COMPLETED",
      session_state: "COMPLETED",
      session_version: before.projection.session_version + 1,
      task_assignee: fixture.membershipId,
      task_status: "COMPLETED",
      task_version: before.projection.task_version + 1,
    });
    expect(after.projection.completed_at).not.toBeNull();
    expect(after.projection.ready_at).toEqual(before.projection.ready_at);
    expect(after.projection.handoff_pending_at).toEqual(
      before.projection.handoff_pending_at,
    );
    expect(after.projection.retrieval_requested_at).toEqual(
      before.projection.retrieval_requested_at,
    );
    expect(after.projection.retrieval_started_at).toEqual(
      before.projection.retrieval_started_at,
    );

    const verification = after.verifications.at(-1)!;
    const release = after.custody.filter(
      (event) => event.event_type === "RELEASED",
    );
    const dispatch = after.dispatch.filter(
      (event) => event.event_type === "COMPLETED",
    );
    expect(verification.consumed_at).not.toBeNull();
    expect(release).toHaveLength(1);
    expect(release[0]).toMatchObject({
      actor_membership_id: fixture.membershipId,
      key_slot_id: fixture.keySlotId,
    });
    expect(dispatch).toHaveLength(1);
    expect(dispatch[0]).toMatchObject({
      actor_membership_id: fixture.membershipId,
      new_assignee_membership_id: fixture.membershipId,
    });
    expect(after.audits.map((event) => event.event_type).sort()).toEqual([
      "VALET_SESSION_COMPLETED",
      "VALET_SESSION_VEHICLE_RELEASED",
    ]);
    const operationTimes = [
      after.projection.completed_at,
      verification.consumed_at,
      release[0]!.occurred_at,
      dispatch[0]!.occurred_at,
      ...after.audits.map((event) => event.occurred_at),
    ].map((value) => value?.toISOString());
    expect(new Set(operationTimes).size).toBe(1);
    expect(
      after.audits.find(
        (event) => event.event_type === "VALET_SESSION_VEHICLE_RELEASED",
      )?.metadata_json,
    ).toEqual({
      handoff_method: "PICKUP_CODE",
      key_slot_id: fixture.keySlotId,
      task_id: fixture.retrievalTaskId,
    });
    expect(
      after.audits.flatMap((event) => Object.keys(event.metadata_json)).join(),
    ).not.toMatch(
      /pickup.?code|qr.?payload|secret|verifier|authorization|bearer/i,
    );
    expect(after.custody.slice(0, -1)).toEqual(before.custody);
  });

  it("releases a valid Dynamic QR handoff", async () => {
    const fixture = await context.prepareStandard("DYNAMIC_QR");
    await expect(context.complete(fixture)).resolves.toMatchObject({
      state: "COMPLETED",
      taskStatus: "COMPLETED",
    });
  });

  it("allows the current Task owner to release a supervisor override", async () => {
    const { fixture } = await context.prepareOverride();
    await expect(context.complete(fixture)).resolves.toMatchObject({
      retrievalRequestStatus: "COMPLETED",
      state: "COMPLETED",
    });
    expect(
      (await context.releaseEffects(fixture)).verifications.at(-1)?.method,
    ).toBe("SUPERVISOR_OVERRIDE");
  });

  it("keeps completion terminal and prevents duplicate history", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    await context.complete(fixture);
    const afterFirst = await context.releaseEffects(fixture);
    await expect(context.complete(fixture)).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });
    await expect(
      context.complete(fixture, fixture.userId, 10),
    ).rejects.toMatchObject({ code: "TASK_INVALID_STATE" });
    expect(await context.releaseEffects(fixture)).toEqual(afterFirst);
  });
});
