import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import {
  createTask,
  createTaskDispatchScope,
  type TaskDispatchScope,
} from "./task-dispatch-fixture.js";

type QueryClient = Pick<Pool, "query">;

export interface MapsTrackingFixture extends TaskDispatchScope {
  mapAreaId: string;
  taskId: string;
  trackingSessionId: string;
}

export async function createMapArea(
  client: QueryClient,
  scope: Pick<TaskDispatchScope, "locationId" | "organizationId">,
  parkingZoneId: string | null = null,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO location_map_areas
       (id, organization_id, location_id, parking_zone_id, purpose, code,
        label, updated_at)
     VALUES ($1, $2, $3, $4, 'PARKING', $5, 'Garage boundary',
             transaction_timestamp())`,
    [id, scope.organizationId, scope.locationId, parkingZoneId, randomUUID()],
  );
  return id;
}

export async function createTrackingSession(
  client: QueryClient,
  scope: TaskDispatchScope,
  taskId: string,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO task_tracking_sessions
       (id, organization_id, location_id, valet_session_id, task_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, scope.organizationId, scope.locationId, scope.valetSessionId, taskId],
  );
  return id;
}

export async function createMapsTrackingFixture(
  client: QueryClient,
): Promise<MapsTrackingFixture> {
  const scope = await createTaskDispatchScope(client);
  const taskId = await createTask(client, scope);
  const mapAreaId = await createMapArea(client, scope);
  const trackingSessionId = await createTrackingSession(client, scope, taskId);
  return { ...scope, mapAreaId, taskId, trackingSessionId };
}

export async function insertRawGpsSample(
  client: QueryClient,
  fixture: MapsTrackingFixture,
  clientSampleId = randomUUID(),
  latitude = 31.9539,
  longitude = 35.9106,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO raw_gps_samples
       (id, organization_id, location_id, valet_session_id, task_id,
        tracking_session_id, client_sample_id, latitude, longitude, captured_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
             transaction_timestamp() - interval '1 second')`,
    [
      id,
      fixture.organizationId,
      fixture.locationId,
      fixture.valetSessionId,
      fixture.taskId,
      fixture.trackingSessionId,
      clientSampleId,
      latitude,
      longitude,
    ],
  );
  return id;
}
