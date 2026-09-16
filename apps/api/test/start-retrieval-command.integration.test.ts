import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createStartRetrievalCommandExecutor } from "../src/modules/retrieval/start-retrieval-command";
import {
  expectStartRetrievalError,
  StartRetrievalTestContext,
} from "./start-retrieval-test-context";

const context = new StartRetrievalTestContext("command");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-006D Start Retrieval command", () => {
  it("atomically starts physical Retrieval and releases current Spot occupancy", async () => {
    const fixture = await context.createStartRetrievalFixture();
    const result = await context.startRetrieval(fixture);
    expect(result).toEqual({
      retrievalStartedAt: expect.any(String),
      sessionId: fixture.sessionId,
      sessionVersion: 6,
      state: "RETRIEVING",
      taskId: fixture.retrievalTaskId,
      taskStatus: "IN_PROGRESS",
      taskVersion: 4,
    });
    const effects = await context.retrievalEffects(fixture);
    expect(effects.projection).toEqual({
      current_assignee_membership_id: null,
      key_slot_id: fixture.keySlotId,
      parking_spot_id: null,
      parking_zone_id: fixture.parkingZoneId,
      request_status: "ACCEPTED",
      retrieval_started_at: new Date(result.retrievalStartedAt),
      session_state: "RETRIEVING",
      session_version: 6,
      task_assignee: fixture.membershipId,
      task_status: "IN_PROGRESS",
      task_version: 4,
    });
    expect(effects.history).toHaveLength(3);
    expect(effects.history.map((event) => event.event_type).sort()).toEqual([
      "CHECKED_OUT",
      "IN_PROGRESS",
      "VALET_SESSION_RETRIEVAL_STARTED",
    ]);
    expect(
      effects.history.every(
        (event) => event.actor_membership_id === fixture.membershipId,
      ),
    ).toBe(true);
    expect(
      effects.history.every(
        (event) =>
          event.occurred_at.getTime() ===
          new Date(result.retrievalStartedAt).getTime(),
      ),
    ).toBe(true);
    expect(
      effects.history.find((event) => event.event_type === "CHECKED_OUT")
        ?.key_slot_id,
    ).toBe(fixture.keySlotId);
    expect(effects.counts).toEqual({ request_count: 1, task_count: 1 });

    const replacement = await context.createCompetingFixture(fixture);
    await context.confirm(replacement);
    expect(
      (await context.completionEffects(replacement)).projection.parking_spot_id,
    ).toBe(fixture.parkingSpotId);
  });

  it("starts Retrieval from a legitimate zone-only parked session", async () => {
    const fixture = await context.createStartRetrievalFixture();
    await context.adminPool.query(
      `UPDATE valet_sessions
       SET parking_spot_id = NULL
       WHERE id = $1`,
      [fixture.sessionId],
    );
    const result = await context.startRetrieval(fixture);
    expect(result).toMatchObject({ state: "RETRIEVING", sessionVersion: 6 });
    expect((await context.retrievalEffects(fixture)).projection).toMatchObject({
      parking_spot_id: null,
      parking_zone_id: fixture.parkingZoneId,
      request_status: "ACCEPTED",
      session_state: "RETRIEVING",
    });
  });

  it.each([
    ["stale Task", { task: 2 }],
    ["stale session", { session: 4 }],
  ])(
    "rejects %s version before readiness with no effects",
    async (_name, versions) => {
      const fixture = await context.createStartRetrievalFixture();
      await context.adminPool.query(
        `UPDATE key_slots SET status = 'INACTIVE' WHERE id = $1`,
        [fixture.keySlotId],
      );
      await expectStartRetrievalError(
        context.startRetrieval(fixture, versions),
        "VERSION_CONFLICT",
      );
      const effects = await context.retrievalEffects(fixture);
      expect(effects.projection).toMatchObject({
        parking_spot_id: fixture.parkingSpotId,
        request_status: "OPEN",
        retrieval_started_at: null,
        session_state: "REQUESTED",
        session_version: 5,
        task_status: "ACCEPTED",
        task_version: 3,
      });
      expect(effects.history).toEqual([]);
    },
  );

  it.each([
    ["QUEUED", "TASK_NOT_FOUND_OR_FORBIDDEN"],
    ["ASSIGNED", "TASK_INVALID_STATE"],
  ] as const)("rejects a %s Retrieval Task", async (status, expectedCode) => {
    const fixture = await context.createStartRetrievalFixture();
    await context.adminPool.query(
      `UPDATE tasks
         SET status = $2::task_status,
             current_assignee_membership_id = CASE
               WHEN $2::task_status = 'QUEUED'::task_status THEN NULL
               ELSE current_assignee_membership_id
             END
         WHERE id = $1`,
      [fixture.retrievalTaskId, status],
    );
    await expectStartRetrievalError(
      context.startRetrieval(fixture),
      expectedCode,
    );
  });

  it("conceals non-owner and rejects ended or revoked owner eligibility", async () => {
    for (const mode of ["non-owner", "ended", "revoked"] as const) {
      const fixture = await context.createStartRetrievalFixture();
      let userId = fixture.userId;
      if (mode === "non-owner")
        userId = (await context.addMember(fixture)).userId;
      if (mode === "ended") {
        await context.adminPool.query(
          `UPDATE shifts SET status = 'ENDED', ended_at = transaction_timestamp()
           WHERE membership_id = $1`,
          [fixture.membershipId],
        );
      }
      if (mode === "revoked") {
        await context.adminPool.query(
          `DELETE FROM membership_location_access WHERE membership_id = $1`,
          [fixture.membershipId],
        );
      }
      await expectStartRetrievalError(
        createStartRetrievalCommandExecutor(context.runtimePool)({
          authenticatedUserId: userId,
          expectedSessionVersion: 5,
          expectedTaskVersion: 3,
          sessionId: fixture.sessionId,
        }),
        "TASK_NOT_FOUND_OR_FORBIDDEN",
      );
    }
  });

  it("requires an OPEN request and active current KeySlot", async () => {
    const request = await context.createStartRetrievalFixture();
    await context.adminPool.query(
      `UPDATE retrieval_requests SET status = 'ACCEPTED' WHERE id = $1`,
      [request.retrievalRequestId],
    );
    await expectStartRetrievalError(
      context.startRetrieval(request),
      "RETRIEVAL_REQUEST_NOT_READY",
    );
    const missingRequest = await context.createStartRetrievalFixture();
    await context.adminPool.query(
      `UPDATE retrieval_requests SET status = 'CANCELLED',
              cancelled_at = transaction_timestamp() WHERE id = $1`,
      [missingRequest.retrievalRequestId],
    );
    await expectStartRetrievalError(
      context.startRetrieval(missingRequest),
      "RETRIEVAL_REQUEST_NOT_READY",
    );
    const key = await context.createStartRetrievalFixture();
    await context.adminPool.query(
      `UPDATE key_slots SET status = 'INACTIVE' WHERE id = $1`,
      [key.keySlotId],
    );
    await expectStartRetrievalError(
      context.startRetrieval(key),
      "KEY_CUSTODY_NOT_READY",
    );
    expect((await context.retrievalEffects(key)).history).toEqual([]);
    const missingKey = await context.createStartRetrievalFixture();
    await context.adminPool.query(
      `UPDATE valet_sessions SET key_slot_id = NULL WHERE id = $1`,
      [missingKey.sessionId],
    );
    await expectStartRetrievalError(
      context.startRetrieval(missingKey),
      "KEY_CUSTODY_NOT_READY",
    );
  });

  it("conceals a foreign tenant and requires exact session readiness", async () => {
    const fixture = await context.createStartRetrievalFixture();
    const foreign = await context.createStartRetrievalFixture();
    await expectStartRetrievalError(
      createStartRetrievalCommandExecutor(context.runtimePool)({
        authenticatedUserId: foreign.userId,
        expectedSessionVersion: 5,
        expectedTaskVersion: 3,
        sessionId: fixture.sessionId,
      }),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
    for (const field of ["state", "retrieval_started_at"] as const) {
      const invalid = await context.createStartRetrievalFixture();
      const sql =
        field === "state"
          ? `UPDATE valet_sessions SET state = 'RETRIEVING' WHERE id = $1`
          : `UPDATE valet_sessions SET retrieval_started_at = transaction_timestamp()
             WHERE id = $1`;
      await context.adminPool.query(sql, [invalid.sessionId]);
      await expectStartRetrievalError(
        context.startRetrieval(invalid),
        "INVALID_STATE_TRANSITION",
      );
    }
  });

  it("requires an active Retrieval Task and never accepts a Parking Task", async () => {
    const fixture = await context.createStartRetrievalFixture();
    await context.adminPool.query(
      `UPDATE tasks SET status = 'CANCELLED' WHERE id = $1`,
      [fixture.retrievalTaskId],
    );
    await expectStartRetrievalError(
      context.startRetrieval(fixture),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
    expect((await context.retrievalEffects(fixture)).history).toEqual([]);
  });
});
