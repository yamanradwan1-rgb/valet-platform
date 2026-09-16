import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Phase4RetrievalCancellationTestContext } from "./phase4-retrieval-cancellation-test-context";

const context = new Phase4RetrievalCancellationTestContext("lifecycle");

beforeAll(async () => context.setupGate(), 120_000);
afterAll(async () => context.teardownGate(), 60_000);

describe("VAL-006H guest pre-start Retrieval cancellation", () => {
  it.each([
    {
      accept: false,
      assign: false,
      dispatch: ["QUEUED", "CANCELLED"],
      state: "QUEUED",
    },
    {
      accept: false,
      assign: true,
      dispatch: ["QUEUED", "ASSIGNED", "CANCELLED"],
      state: "ASSIGNED",
    },
    {
      accept: true,
      assign: true,
      dispatch: ["QUEUED", "ASSIGNED", "ACCEPTED", "CANCELLED"],
      state: "ACCEPTED",
    },
  ])(
    "cancels a coherent $state task and preserves custody",
    async (variant) => {
      const parked = await context.createParkedFixture();
      let fixture = await context.requestRetrieval(parked);
      if (variant.assign)
        fixture = await context.assign(fixture, variant.accept);
      const expectedAssignee = variant.assign ? fixture.membershipId : null;
      const taskVersion = fixture.taskVersion;
      const custodyBefore = await context.eventTypes(
        "key_custody_events",
        fixture.sessionId,
      );

      const cancelled = await context.cancel(fixture);
      expect(cancelled).toMatchObject({
        body: { state: "PARKED", valetSessionId: fixture.sessionId },
        status: 200,
      });
      expect(cancelled.headers.get("cache-control")).toBe("no-store");
      expect(cancelled.headers.get("pragma")).toBe("no-cache");
      expect(Object.keys(cancelled.body).sort()).toEqual([
        "guestVehicleReadyNotificationEnabled",
        "readyAt",
        "state",
        "valetSessionId",
        "vehicle",
      ]);

      const effects = await context.cancellationEffects(fixture);
      expect(effects.projection).toMatchObject({
        key_slot_id: fixture.keySlotId,
        parking_spot_id: fixture.parkingSpotId,
        parking_zone_id: fixture.parkingZoneId,
        handoff_pending_at: null,
        ready_at: null,
        request_status: "CANCELLED",
        retrieval_started_at: null,
        session_state: "PARKED",
        session_version: fixture.sessionVersion + 1,
        task_assignee: expectedAssignee,
        task_status: "CANCELLED",
        task_version: taskVersion + 1,
        verification_count: 0,
      });
      expect(effects.projection.cancelled_at).toEqual(
        effects.projection.task_updated_at,
      );
      expect(effects.custody).toEqual(custodyBefore);
      expect(effects.custody).toEqual([
        "SLOT_ASSIGNED",
        "CHECKED_OUT",
        "RETURNED_TO_SLOT",
      ]);
      expect(effects.dispatch.map((event) => event.event_type)).toEqual(
        variant.dispatch,
      );
      expect(effects.dispatch.at(-1)).toMatchObject({
        actor_membership_id: null,
        event_type: "CANCELLED",
        new_assignee_membership_id: null,
        previous_assignee_membership_id: expectedAssignee,
        reason: null,
      });
      expect(effects.audits).toHaveLength(1);
      expect(effects.audits[0]).toMatchObject({
        actor_membership_id: null,
        event_type: "RETRIEVAL_CANCELLED",
        metadata_json: expect.objectContaining({
          from_session_state: "REQUESTED",
          from_task_status: variant.state,
          requester_type: "CUSTOMER",
          retrieval_request_id: fixture.requestId,
          task_id: fixture.taskId,
          to_session_state: "PARKED",
          to_task_status: "CANCELLED",
        }),
      });
      expect(JSON.stringify(effects.audits)).not.toMatch(
        /authorization|bearer|access.?token|pickup.?code|qr.?payload|verifier|hmac|password|secret|phone|contact|address|key.?slot|parking.?(?:spot|zone)/i,
      );

      const stable = JSON.stringify(effects);
      expect(await context.cancel(fixture)).toMatchObject({
        body: { state: "PARKED" },
        status: 200,
      });
      expect(JSON.stringify(await context.cancellationEffects(fixture))).toBe(
        stable,
      );
    },
  );

  it("creates a fresh lifecycle when the guest requests Retrieval again", async () => {
    const parked = await context.createParkedFixture();
    const first = await context.requestRetrieval(parked);
    await context.cancel(first);
    const second = await context.requestRetrieval(parked);
    expect(second.requestId).not.toBe(first.requestId);
    expect(second.taskId).not.toBe(first.taskId);
    expect(await context.lifecycleRows(parked.sessionId)).toMatchObject({
      requests: [
        { id: first.requestId, status: "CANCELLED" },
        { id: second.requestId, status: "OPEN" },
      ],
      tasks: [
        { id: first.taskId, status: "CANCELLED" },
        { id: second.taskId, status: "QUEUED" },
      ],
    });
    const owned = await context.assign(second, true);
    expect(
      await context.staffPost(
        owned.accessToken,
        `/v1/staff/valet-sessions/${owned.sessionId}/start-retrieval`,
        {
          expectedSessionVersion: owned.sessionVersion,
          expectedTaskVersion: owned.taskVersion,
        },
      ),
    ).toMatchObject({ status: 200, body: { state: "RETRIEVING" } });
    expect(await context.lifecycleRows(parked.sessionId)).toMatchObject({
      requests: [
        { id: first.requestId, status: "CANCELLED" },
        { id: second.requestId, status: "ACCEPTED" },
      ],
      tasks: [
        { id: first.taskId, status: "CANCELLED" },
        { id: second.taskId, status: "IN_PROGRESS" },
      ],
    });
  });
});
