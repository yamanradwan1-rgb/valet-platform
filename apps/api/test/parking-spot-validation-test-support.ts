import type {
  ConfirmParkedFixture,
  ConfirmParkedTestContext,
} from "./confirm-parked-test-context";

export async function validationInput(
  context: ConfirmParkedTestContext,
  f: ConfirmParkedFixture,
) {
  const shift = await context.adminPool.query<{ id: string }>(
    `SELECT id::text FROM shifts WHERE membership_id = $1 AND status = 'ACTIVE'`,
    [f.membershipId],
  );
  return {
    authenticatedUserId: f.userId,
    sessionId: f.sessionId,
    taskId: f.taskId,
    expectedShiftId: shift.rows[0]!.id,
    expectedSessionVersion: 3,
    expectedTaskVersion: 4,
    parkingSpotCode: f.parkingSpotCode,
  };
}

export async function parkingPhysicalSnapshot(
  context: ConfirmParkedTestContext,
  f: ConfirmParkedFixture,
) {
  const tables = [
    "valet_sessions",
    "tasks",
    "task_tracking_sessions",
    "audit_events",
    "dispatch_events",
    "key_custody_events",
  ];
  const values = [];
  for (const table of tables) {
    const column = table === "valet_sessions" ? "id" : "valet_session_id";
    values.push(
      (
        await context.adminPool.query(
          `SELECT * FROM ${table} WHERE ${column} = $1 ORDER BY id`,
          [f.sessionId],
        )
      ).rows,
    );
  }
  return values;
}
