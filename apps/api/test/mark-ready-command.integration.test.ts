import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMarkReadyCommandExecutor } from "../src/modules/retrieval/mark-ready-command";
import {
  expectMarkReadyError,
  MarkReadyTestContext,
} from "./mark-ready-test-context";

const context = new MarkReadyTestContext("command");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-006E Mark Ready command", () => {
  it("marks the owned Retrieval READY without advancing Task, request, or custody", async () => {
    const fixture = await context.createMarkReadyFixture();
    const before = await context.readyEffects(fixture);
    const result = await context.markReady(fixture);
    expect(result).toEqual({
      readyAt: expect.any(String),
      sessionId: fixture.sessionId,
      sessionVersion: 7,
      state: "READY",
      taskId: fixture.retrievalTaskId,
      taskStatus: "IN_PROGRESS",
      taskVersion: 4,
    });
    const effects = await context.readyEffects(fixture);
    expect(effects.projection).toEqual({
      current_assignee_membership_id: null,
      key_slot_id: fixture.keySlotId,
      parking_spot_id: null,
      parking_zone_id: fixture.parkingZoneId,
      ready_at: new Date(result.readyAt),
      request_status: "ACCEPTED",
      retrieval_started_at: before.projection.retrieval_started_at,
      session_state: "READY",
      session_version: 7,
      task_assignee: fixture.membershipId,
      task_status: "IN_PROGRESS",
      task_version: 4,
    });
    expect(effects.counts).toEqual({
      checked_out_count: 1,
      in_progress_count: 1,
      notification_count: 0,
      ready_audit_count: 1,
    });
    expect(effects.audit).toEqual([
      {
        actor_membership_id: fixture.membershipId,
        occurred_at: new Date(result.readyAt),
      },
    ]);
  });

  it("rejects stale version before state details with no Ready Audit", async () => {
    const fixture = await context.createMarkReadyFixture();
    await context.adminPool.query(
      `UPDATE valet_sessions SET ready_at = transaction_timestamp() WHERE id = $1`,
      [fixture.sessionId],
    );
    await expectMarkReadyError(
      context.markReady(fixture, 5),
      "VERSION_CONFLICT",
    );
    expect((await context.readyEffects(fixture)).counts.ready_audit_count).toBe(
      0,
    );
  });

  it.each(["ACCEPTED", "ASSIGNED", "QUEUED"] as const)(
    "rejects a %s Retrieval Task",
    async (status) => {
      const fixture = await context.createMarkReadyFixture();
      await context.adminPool.query(
        `UPDATE tasks
         SET status = $2,
             current_assignee_membership_id = CASE WHEN $2 = 'QUEUED' THEN NULL ELSE current_assignee_membership_id END
         WHERE id = $1`,
        [fixture.retrievalTaskId, status],
      );
      await expectMarkReadyError(
        context.markReady(fixture),
        "TASK_INVALID_STATE",
      );
    },
  );

  it("conceals non-owner, foreign tenant, ended Shift, and revoked access", async () => {
    for (const mode of ["non-owner", "foreign", "ended", "revoked"] as const) {
      const fixture = await context.createMarkReadyFixture();
      let userId = fixture.userId;
      if (mode === "non-owner")
        userId = (await context.addMember(fixture)).userId;
      if (mode === "foreign")
        userId = (await context.createMarkReadyFixture()).userId;
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
      await expectMarkReadyError(
        createMarkReadyCommandExecutor(context.runtimePool)({
          authenticatedUserId: userId,
          expectedSessionVersion: 6,
          sessionId: fixture.sessionId,
        }),
        "TASK_NOT_FOUND_OR_FORBIDDEN",
      );
    }
  });

  it("requires RETRIEVING Session and coherent accepted RetrievalRequest", async () => {
    const invalidSession = await context.createMarkReadyFixture();
    await context.adminPool.query(
      `UPDATE valet_sessions SET state = 'READY' WHERE id = $1`,
      [invalidSession.sessionId],
    );
    await expectMarkReadyError(
      context.markReady(invalidSession),
      "INVALID_STATE_TRANSITION",
    );
    const invalidRequest = await context.createMarkReadyFixture();
    await context.adminPool.query(
      `UPDATE retrieval_requests SET status = 'OPEN' WHERE id = $1`,
      [invalidRequest.retrievalRequestId],
    );
    await expectMarkReadyError(
      context.markReady(invalidRequest),
      "RETRIEVAL_REQUEST_NOT_READY",
    );
    const missingRequest = await context.createMarkReadyFixture();
    await context.adminPool.query(
      `UPDATE retrieval_requests SET status = 'CANCELLED',
              cancelled_at = transaction_timestamp() WHERE id = $1`,
      [missingRequest.retrievalRequestId],
    );
    await expectMarkReadyError(
      context.markReady(missingRequest),
      "RETRIEVAL_REQUEST_NOT_READY",
    );
  });

  it("never substitutes a Parking Task for the Retrieval Task", async () => {
    const fixture = await context.createMarkReadyFixture();
    await context.adminPool.query(
      `UPDATE tasks SET status = 'CANCELLED' WHERE id = $1`,
      [fixture.retrievalTaskId],
    );
    await expectMarkReadyError(
      context.markReady(fixture),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
  });
});
