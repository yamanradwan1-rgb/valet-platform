import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { createGpsIngestionCommandExecutor } from "../src/modules/tracking/gps-ingestion-command";
import { Issue352TakeoverTestContext } from "./issue352-takeover-test-context";

type Parking = Awaited<
  ReturnType<Issue352TakeoverTestContext["createStartParkingFixture"]>
>;

export async function sendTrackedGpsRoute(
  db: Issue352TakeoverTestContext,
  source: Parking,
  userId: string,
  points: readonly { latitude: number; longitude: number }[],
  start: Date,
): Promise<void> {
  await createGpsIngestionCommandExecutor(db.runtimePool)({
    authenticatedUserId: userId,
    sessionId: source.sessionId,
    samples: points.map((point, index) => ({
      ...point,
      accuracyMeters: 8,
      clientSampleId: randomUUID(),
      capturedAt: new Date(start.getTime() + index * 1_000).toISOString(),
    })),
  });
}

export async function trackingSessionForAssignee(
  db: Issue352TakeoverTestContext,
  source: Parking,
  assigneeId: string,
): Promise<string> {
  const rows = await db.adminPool.query<{ id: string }>(
    `SELECT id::text FROM task_tracking_sessions
     WHERE organization_id=$1 AND task_id=$2 AND assignee_membership_id=$3`,
    [source.organizationId, source.taskId, assigneeId],
  );
  expect(rows.rows).toHaveLength(1);
  return rows.rows[0]!.id;
}

export async function violationEventIds(
  db: Issue352TakeoverTestContext,
  source: Parking,
  trackingSessionId: string,
): Promise<string[]> {
  const rows = await db.adminPool.query<{ id: string }>(
    `SELECT id::text FROM geofence_events
     WHERE organization_id=$1 AND location_id=$2
       AND tracking_session_id=$3 AND event_type='VIOLATION'
     ORDER BY occurred_at,id`,
    [source.organizationId, source.locationId, trackingSessionId],
  );
  return rows.rows.map((row) => row.id);
}
