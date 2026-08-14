import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import type {
  CanonicalGpsSample,
  LockedGpsSession,
  LockedGpsTask,
  LockedTrackingSession,
} from "./gps-ingestion-types";
import { pointInPolygon, type GeoPoint } from "./point-in-polygon";
import type {
  GeofenceArea,
  GeofencePurpose,
  OperationalFrontier,
  PendingGeofenceEvent,
} from "./geofence-types";

interface AreaRow {
  readonly area_id: string;
  readonly latitude: string;
  readonly longitude: string;
  readonly purpose: GeofencePurpose;
}

const allowedPurposes = new Set<GeofencePurpose>([
  "PARKING",
  "OVERFLOW",
  "STAGING",
]);

export async function loadOperationalFrontier(
  transaction: PostgresTransaction,
  trackerId: string,
): Promise<OperationalFrontier | null> {
  const result = await transaction.query<{
    captured_at: Date;
    id: string;
    latitude: string;
    longitude: string;
  }>(
    `SELECT id::text, latitude::text, longitude::text, captured_at
     FROM raw_gps_samples WHERE tracking_session_id = $1
     ORDER BY captured_at DESC, id DESC LIMIT 1`,
    [trackerId],
  );
  const row = result.rows[0];
  return row === undefined
    ? null
    : {
        capturedAt: row.captured_at,
        id: row.id,
        latitude: row.latitude,
        longitude: row.longitude,
      };
}

export async function loadActiveGeofenceAreas(
  transaction: PostgresTransaction,
  organizationId: string,
  locationId: string,
): Promise<readonly GeofenceArea[]> {
  const result = await transaction.query<AreaRow>(
    `SELECT area.id::text AS area_id, area.purpose::text,
            vertex.latitude::text, vertex.longitude::text
     FROM location_map_areas AS area
     INNER JOIN location_map_area_vertices AS vertex
       ON vertex.organization_id = area.organization_id
      AND vertex.location_id = area.location_id
      AND vertex.map_area_id = area.id
     WHERE area.organization_id = $1 AND area.location_id = $2
       AND area.active = true
     ORDER BY area.id, vertex.position`,
    [organizationId, locationId],
  );
  const areas = new Map<
    string,
    { id: string; purpose: GeofencePurpose; vertices: GeoPoint[] }
  >();
  for (const row of result.rows) {
    const area = areas.get(row.area_id);
    if (area === undefined) {
      areas.set(row.area_id, {
        id: row.area_id,
        purpose: row.purpose,
        vertices: [{ latitude: row.latitude, longitude: row.longitude }],
      });
    } else {
      area.vertices.push({
        latitude: row.latitude,
        longitude: row.longitude,
      });
    }
  }
  return [...areas.values()];
}

function transitions(
  previous: OperationalFrontier | CanonicalGpsSample | null,
  current: CanonicalGpsSample,
  areas: readonly GeofenceArea[],
): PendingGeofenceEvent[] {
  const events: PendingGeofenceEvent[] = [];
  const previousInside = new Map<string, boolean>();
  const currentInside = new Map<string, boolean>();
  for (const area of areas) {
    const wasInside =
      previous !== null && pointInPolygon(previous, area.vertices);
    const isInside = pointInPolygon(current, area.vertices);
    previousInside.set(area.id, wasInside);
    currentInside.set(area.id, isInside);
    const type =
      !wasInside && isInside
        ? "ENTERED"
        : wasInside && !isInside
          ? "EXITED"
          : null;
    if (type !== null) {
      events.push({ mapAreaId: area.id, occurredAt: current.capturedAt, type });
    }
    if (area.purpose === "RESTRICTED" && !wasInside && isInside) {
      events.push({
        mapAreaId: area.id,
        occurredAt: current.capturedAt,
        type: "VIOLATION",
      });
    }
  }
  if (previous === null) return events;
  const allowed = areas.filter((area) => allowedPurposes.has(area.purpose));
  const wasAllowed = allowed.some((area) => previousInside.get(area.id));
  const isAllowed = allowed.some((area) => currentInside.get(area.id));
  if (wasAllowed && !isAllowed) {
    const source = allowed
      .filter(
        (area) => previousInside.get(area.id) && !currentInside.get(area.id),
      )
      .sort((left, right) =>
        left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
      )[0]!;
    events.push({
      mapAreaId: source.id,
      occurredAt: current.capturedAt,
      type: "VIOLATION",
    });
  }
  return events;
}

export function evaluateAcceptedGpsSamples(
  initialFrontier: OperationalFrontier | null,
  areas: readonly GeofenceArea[],
  samples: readonly CanonicalGpsSample[],
): readonly PendingGeofenceEvent[] {
  let frontier: OperationalFrontier | CanonicalGpsSample | null =
    initialFrontier;
  const events: PendingGeofenceEvent[] = [];
  const ordered = [...samples].sort(
    (left, right) =>
      left.capturedAt.getTime() - right.capturedAt.getTime() ||
      left.ordinal - right.ordinal,
  );
  for (const sample of ordered) {
    if (
      frontier !== null &&
      sample.capturedAt.getTime() <= frontier.capturedAt.getTime()
    ) {
      continue;
    }
    events.push(...transitions(frontier, sample, areas));
    frontier = sample;
  }
  return events;
}

export async function appendGeofenceEvents(
  transaction: PostgresTransaction,
  session: LockedGpsSession,
  task: LockedGpsTask,
  tracker: LockedTrackingSession,
  events: readonly PendingGeofenceEvent[],
): Promise<void> {
  if (events.length === 0) return;
  await transaction.query(
    `INSERT INTO geofence_events
       (id, organization_id, location_id, valet_session_id, task_id,
        tracking_session_id, map_area_id, event_type, occurred_at)
     SELECT input.id, $1, $2, $3, $4, $5, input.map_area_id,
            input.event_type::geofence_event_type, input.occurred_at
     FROM unnest($6::uuid[], $7::uuid[], $8::text[], $9::timestamptz[])
       AS input(id, map_area_id, event_type, occurred_at)`,
    [
      session.organization_id,
      session.location_id,
      session.id,
      task.id,
      tracker.id,
      events.map(() => randomUUID()),
      events.map((event) => event.mapAreaId),
      events.map((event) => event.type),
      events.map((event) => event.occurredAt),
    ],
  );
}
