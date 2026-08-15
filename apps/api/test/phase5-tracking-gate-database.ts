import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

export interface GpsSamplePayload {
  readonly accuracyMeters: number;
  readonly capturedAt: string;
  readonly clientSampleId: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface TrackingSessionRow {
  readonly ended_at: Date | null;
  readonly id: string;
  readonly location_id: string;
  readonly organization_id: string;
  readonly started_at: Date;
  readonly task_id: string;
  readonly valet_session_id: string;
}

export interface RawGpsSampleRow {
  readonly captured_at: Date;
  readonly client_sample_id: string;
  readonly id: string;
  readonly latitude: string;
  readonly location_id: string;
  readonly longitude: string;
  readonly organization_id: string;
  readonly received_at: Date;
  readonly task_id: string;
  readonly tracking_session_id: string;
  readonly valet_session_id: string;
}

export interface GeofenceEventRow {
  readonly event_type: "ENTERED" | "EXITED" | "VIOLATION";
  readonly id: string;
  readonly map_area_id: string;
  readonly occurred_at: Date;
  readonly recorded_at: Date;
}

export interface SeededAreas {
  readonly allowedAreaId: string;
  readonly restrictedAreaId: string;
}

const allowedSquare = [
  { latitude: 31, longitude: 35 },
  { latitude: 31, longitude: 36 },
  { latitude: 32, longitude: 36 },
  { latitude: 32, longitude: 35 },
];

const restrictedSquare = [
  { latitude: 31.4, longitude: 35.4 },
  { latitude: 31.4, longitude: 35.6 },
  { latitude: 31.6, longitude: 35.6 },
  { latitude: 31.6, longitude: 35.4 },
];

export async function queryDbNow(pool: Pool): Promise<Date> {
  const result = await pool.query<{ dbNow: Date }>(
    `SELECT clock_timestamp()::timestamptz(3) AS "dbNow"`,
  );
  return result.rows[0]!.dbNow;
}

export async function setTrackingPolicy(
  pool: Pool,
  organizationId: string,
  locationId: string,
  companyTracking: boolean,
  locationOverride: boolean | null,
): Promise<void> {
  await pool.query(
    `UPDATE organizations SET tracking_enabled = $2, updated_at = clock_timestamp() WHERE id = $1`,
    [organizationId, companyTracking],
  );
  await pool.query(
    `UPDATE locations SET tracking_enabled_override = $3, updated_at = clock_timestamp()
     WHERE organization_id = $1 AND id = $2`,
    [organizationId, locationId, locationOverride],
  );
}

export async function setRetentionPolicy(
  pool: Pool,
  organizationId: string,
  locationId: string,
  companyDays: number,
  locationOverrideDays: number | null,
): Promise<void> {
  await pool.query(
    `UPDATE organizations SET raw_gps_retention_days = $2, updated_at = clock_timestamp() WHERE id = $1`,
    [organizationId, companyDays],
  );
  await pool.query(
    `UPDATE locations SET raw_gps_retention_days_override = $3, updated_at = clock_timestamp()
     WHERE organization_id = $1 AND id = $2`,
    [organizationId, locationId, locationOverrideDays],
  );
}

async function insertMapArea(
  pool: Pool,
  areaId: string,
  organizationId: string,
  locationId: string,
  purpose: string,
  vertices: readonly { latitude: number; longitude: number }[],
): Promise<void> {
  await pool.query(
    `INSERT INTO location_map_areas
       (id, organization_id, location_id, purpose, code, label, active, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'Area', true, clock_timestamp())`,
    [areaId, organizationId, locationId, purpose, randomUUID()],
  );
  await pool.query(
    `INSERT INTO location_map_area_vertices
       (id, organization_id, location_id, map_area_id, position, latitude, longitude)
     SELECT input.id, $2, $3, $1, input.position, input.latitude, input.longitude
     FROM unnest($4::uuid[], $5::integer[], $6::numeric[], $7::numeric[])
       AS input(id, position, latitude, longitude)`,
    [
      areaId,
      organizationId,
      locationId,
      vertices.map(() => randomUUID()),
      vertices.map((_, i) => i),
      vertices.map((v) => v.latitude),
      vertices.map((v) => v.longitude),
    ],
  );
}

export async function seedMapPolygons(
  pool: Pool,
  organizationId: string,
  locationId: string,
): Promise<SeededAreas> {
  const allowedAreaId = "00000000-0000-4000-8000-000000000001";
  const restrictedAreaId = "00000000-0000-4000-8000-000000000002";
  await insertMapArea(
    pool,
    allowedAreaId,
    organizationId,
    locationId,
    "PARKING",
    allowedSquare,
  );
  await insertMapArea(
    pool,
    restrictedAreaId,
    organizationId,
    locationId,
    "RESTRICTED",
    restrictedSquare,
  );
  return { allowedAreaId, restrictedAreaId };
}

export function buildParkingSamples(dbNow: Date): GpsSamplePayload[] {
  const t = dbNow.getTime();
  const points = [
    { latitude: 33, longitude: 38 },
    { latitude: 31.2, longitude: 35.2 },
    { latitude: 31.5, longitude: 35.5 },
    { latitude: 33, longitude: 38 },
  ];
  return points.map((point, index) => ({
    accuracyMeters: 5,
    capturedAt: new Date(t + index * 1000).toISOString(),
    clientSampleId: randomUUID(),
    ...point,
  }));
}

export function buildRetrievalSamples(dbNow: Date): GpsSamplePayload[] {
  const t = dbNow.getTime();
  const points = [
    { latitude: 31.5, longitude: 35.5 },
    { latitude: 31.2, longitude: 35.2 },
  ];
  return points.map((point, index) => ({
    accuracyMeters: 5,
    capturedAt: new Date(t + index * 1000).toISOString(),
    clientSampleId: randomUUID(),
    ...point,
  }));
}

export async function getTrackers(
  pool: Pool,
  sessionId: string,
): Promise<TrackingSessionRow[]> {
  const result = await pool.query<TrackingSessionRow>(
    `SELECT id::text, organization_id::text, location_id::text,
            valet_session_id::text, task_id::text, started_at, ended_at
     FROM task_tracking_sessions WHERE valet_session_id = $1 ORDER BY started_at, id`,
    [sessionId],
  );
  return result.rows;
}

export async function getRawGpsSamples(
  pool: Pool,
  trackingSessionId: string,
): Promise<RawGpsSampleRow[]> {
  const result = await pool.query<RawGpsSampleRow>(
    `SELECT id::text, organization_id::text, location_id::text,
            valet_session_id::text, task_id::text, tracking_session_id::text,
            client_sample_id::text, latitude::text, longitude::text,
            captured_at, received_at
     FROM raw_gps_samples WHERE tracking_session_id = $1 ORDER BY captured_at, id`,
    [trackingSessionId],
  );
  return result.rows;
}

export async function getGeofenceEvents(
  pool: Pool,
  trackingSessionId: string,
): Promise<GeofenceEventRow[]> {
  const result = await pool.query<GeofenceEventRow>(
    `SELECT id::text, event_type::text, map_area_id::text, occurred_at, recorded_at
     FROM geofence_events WHERE tracking_session_id = $1 ORDER BY occurred_at, event_type, map_area_id`,
    [trackingSessionId],
  );
  return result.rows;
}

export async function getProtectedStateSnapshot(
  pool: Pool,
  sessionId: string,
  taskId: string,
  trackingSessionId?: string,
) {
  const result = await pool.query<{
    assignee_id: string | null;
    audit_count: number;
    dispatch_count: number;
    geofence_count: number;
    incident_count: number;
    notification_count: number;
    raw_count: number;
    session_state: string;
    session_version: number;
    task_status: string;
    task_version: number;
    tracker_ended_at: Date | null;
  }>(
    `SELECT session.state::text AS session_state, session.version AS session_version,
            task.status::text AS task_status, task.version AS task_version,
            task.current_assignee_membership_id::text AS assignee_id,
            tracker.ended_at AS tracker_ended_at,
            (SELECT count(*)::integer FROM incidents WHERE valet_session_id = session.id) AS incident_count,
            (SELECT count(*)::integer FROM notifications WHERE valet_session_id = session.id) AS notification_count,
            (SELECT count(*)::integer FROM dispatch_events WHERE task_id = task.id) AS dispatch_count,
            (SELECT count(*)::integer FROM audit_events WHERE valet_session_id = session.id) AS audit_count,
            (SELECT count(*)::integer FROM raw_gps_samples WHERE tracking_session_id = $3) AS raw_count,
            (SELECT count(*)::integer FROM geofence_events WHERE tracking_session_id = $3) AS geofence_count
     FROM valet_sessions AS session
     INNER JOIN tasks AS task ON task.id = $2
     LEFT JOIN task_tracking_sessions AS tracker ON tracker.id = $3
     WHERE session.id = $1`,
    [sessionId, taskId, trackingSessionId ?? null],
  );
  return result.rows[0]!;
}

export async function ageRawGpsSample(
  pool: Pool,
  sampleId: string,
  daysOld: number,
): Promise<void> {
  await pool.query(
    `UPDATE raw_gps_samples
     SET received_at = clock_timestamp() - ($2::text || ' days')::interval WHERE id = $1`,
    [sampleId, daysOld.toString()],
  );
}

export async function executeRetentionCleanup(
  pool: Pool,
  batchLimit = 1000,
): Promise<number> {
  const result = await pool.query<{ deleted: number }>(
    `SELECT public.cleanup_expired_raw_gps_samples($1) AS deleted`,
    [batchLimit],
  );
  return result.rows[0]?.deleted ?? 0;
}
