import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { createTaskRouteRecordingsQuery } from "../src/modules/tracking/task-route-recordings-query";
import { RouteHistoryTestContext } from "./route-history-test-context";
import type { TrackingFixture } from "./gps-ingestion-test-context";

export class TaskRouteTestContext extends RouteHistoryTestContext {
  constructor(label: string) {
    super(`issue343_${label}`);
  }

  async credential(
    userId: string,
  ): Promise<StaffSessionContext & { readonly accessToken: string }> {
    const staffAuthSessionId = randomUUID();
    const accessToken = `vsa1.${randomBytes(32).toString("base64url")}`;
    const accessTokenHash = `staff-access-sha256:v1:${createHash("sha256").update(accessToken).digest("hex")}`;
    const result = await this.adminPool.query<{ created_at: Date }>(
      `WITH instant AS (SELECT clock_timestamp()::timestamptz(3) AS now)
       INSERT INTO staff_auth_sessions
       (id, user_id, current_access_token_hash, access_expires_at,
        absolute_expires_at, created_at, last_rotated_at)
       SELECT $1, $2, $3, now + interval '15 minutes', now + interval '30 days', now, now
       FROM instant RETURNING created_at`,
      [staffAuthSessionId, userId, accessTokenHash],
    );
    return {
      userId,
      accessToken,
      staffAuthSessionId,
      accessTokenHash,
      createdAt: result.rows[0]!.created_at,
    };
  }

  async complete(fixture: TrackingFixture) {
    await this.endTracker(fixture);
    await this.adminPool.query(
      `UPDATE tasks SET status = 'COMPLETED' WHERE id = $1`,
      [fixture.movementTaskId],
    );
  }

  discover(
    staffSessionContext: StaffSessionContext,
    taskId: string,
    cursor?: string,
    limit = 100,
  ) {
    return createTaskRouteRecordingsQuery(this.runtimePool)({
      staffSessionContext,
      taskId,
      limit,
      ...(cursor === undefined ? {} : { cursor }),
    });
  }
}
