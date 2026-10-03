import {
  StartParkingTestContext,
  type StartParkingFixture,
} from "./start-parking-test-context";
import { createCancelBeforeParkingCommandExecutor } from "../src/modules/parking/cancel-before-parking-command";
import { createParkingCancellationStatusQuery } from "../src/modules/parking/cancel-before-parking-status-query";
import type { TestRole } from "./shift-test-context";

export class ParkingCancellationTestContext extends StartParkingTestContext {
  async target(status = "ACCEPTED", role: TestRole = "VALET_EMPLOYEE") {
    const fixture = await this.createStartParkingFixture({
      assignKey: false,
      role,
    });
    await this.adminPool.query(
      `UPDATE valet_sessions SET checking_in_completed_at=clock_timestamp() WHERE id=$1`,
      [fixture.sessionId],
    );
    await this.adminPool.query(
      `UPDATE tasks SET status=$2::task_status, current_assignee_membership_id=
       CASE WHEN $2::task_status='QUEUED' THEN NULL ELSE current_assignee_membership_id END
       WHERE id=$1`,
      [fixture.taskId, status],
    );
    const shift = await this.adminPool.query<{ id: string }>(
      "SELECT id FROM shifts WHERE membership_id=$1 AND status='ACTIVE'",
      [fixture.membershipId],
    );
    return {
      fixture,
      input: {
        authenticatedUserId: fixture.userId,
        sessionId: fixture.sessionId,
        taskId: fixture.taskId,
        expectedShiftId: shift.rows[0]!.id,
        expectedSessionVersion: 1,
        expectedTaskVersion: 3,
      },
    };
  }
  cancel(input: Awaited<ReturnType<this["target"]>>["input"], options = {}) {
    return createCancelBeforeParkingCommandExecutor(
      this.runtimePool,
      options,
    )(input);
  }
  status(input: Awaited<ReturnType<this["target"]>>["input"]) {
    return createParkingCancellationStatusQuery(this.runtimePool)(input);
  }
  async cancellationFacts(fixture: StartParkingFixture) {
    const projection = await this.adminPool.query(
      `SELECT to_jsonb(s) AS session,to_jsonb(t) AS task FROM valet_sessions s
       JOIN tasks t ON t.valet_session_id=s.id WHERE s.id=$1 AND t.id=$2`,
      [fixture.sessionId, fixture.taskId],
    );
    const history = await this.adminPool.query(
      `SELECT event_type,occurred_at,metadata_json FROM audit_events WHERE valet_session_id=$1
       AND event_type='VALET_SESSION_PRE_CUSTODY_CANCELLED'`,
      [fixture.sessionId],
    );
    const dispatch = await this.adminPool.query(
      `SELECT * FROM dispatch_events WHERE task_id=$1 AND event_type='CANCELLED'`,
      [fixture.taskId],
    );
    return {
      ...projection.rows[0],
      history: history.rows,
      dispatch: dispatch.rows,
    };
  }
}
