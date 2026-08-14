import { randomUUID } from "node:crypto";

import type { GpsIngestionRequest } from "@valet/contracts";

import {
  GpsIngestionTestContext,
  type TrackingFixture,
} from "./gps-ingestion-test-context";

export type AreaPurpose = "OVERFLOW" | "PARKING" | "RESTRICTED" | "STAGING";

export interface TestPoint {
  readonly latitude: number;
  readonly longitude: number;
}

export interface GeofenceEventRow {
  readonly event_type: "ENTERED" | "EXITED" | "VIOLATION";
  readonly map_area_id: string;
  readonly occurred_at: Date;
  readonly recorded_at: Date;
}

export const insideA = { latitude: 31.5, longitude: 35.5 };
export const insideB = { latitude: 31.5, longitude: 36.5 };
export const outside = { latitude: 33, longitude: 38 };

export class GeofenceTestContext extends GpsIngestionTestContext {
  constructor(label: string) {
    super(`007e_${label}`);
  }

  async addArea(
    fixture: TrackingFixture,
    purpose: AreaPurpose,
    vertices: readonly TestPoint[] = [
      { latitude: 31, longitude: 35 },
      { latitude: 31, longitude: 36 },
      { latitude: 32, longitude: 36 },
      { latitude: 32, longitude: 35 },
    ],
    options: { active?: boolean; id?: string } = {},
  ): Promise<string> {
    const areaId = options.id ?? randomUUID();
    await this.adminPool.query(
      `INSERT INTO location_map_areas
       (id, organization_id, location_id, purpose, code, label, active,
        updated_at)
       VALUES ($1, $2, $3, $4, $5, 'Test area', $6,
               transaction_timestamp())`,
      [
        areaId,
        fixture.organizationId,
        fixture.locationId,
        purpose,
        randomUUID(),
        options.active ?? true,
      ],
    );
    await this.adminPool.query(
      `INSERT INTO location_map_area_vertices
       (id, organization_id, location_id, map_area_id, position,
        latitude, longitude)
       SELECT input.id, $2, $3, $1, input.position,
              input.latitude, input.longitude
       FROM unnest($4::uuid[], $5::integer[], $6::numeric[], $7::numeric[])
         AS input(id, position, latitude, longitude)`,
      [
        areaId,
        fixture.organizationId,
        fixture.locationId,
        vertices.map(() => randomUUID()),
        vertices.map((_, index) => index),
        vertices.map((vertex) => vertex.latitude),
        vertices.map((vertex) => vertex.longitude),
      ],
    );
    return areaId;
  }

  async samples(
    points: readonly TestPoint[],
    start?: Date,
  ): Promise<GpsIngestionRequest["samples"]> {
    const baseline = start ?? (await this.databaseTime());
    return points.map((point, index) => ({
      accuracyMeters: 8,
      capturedAt: new Date(baseline.getTime() + index * 1_000).toISOString(),
      clientSampleId: randomUUID(),
      ...point,
    }));
  }

  async events(fixture: TrackingFixture): Promise<GeofenceEventRow[]> {
    const result = await this.adminPool.query<GeofenceEventRow>(
      `SELECT event_type::text, map_area_id::text, occurred_at, recorded_at
       FROM geofence_events WHERE tracking_session_id = $1
       ORDER BY occurred_at, event_type, map_area_id`,
      [fixture.trackingSessionId],
    );
    return result.rows;
  }

  async protectedState(fixture: TrackingFixture) {
    const result = await this.adminPool.query<{
      assignee_id: string;
      audit_count: number;
      dispatch_count: number;
      ended_at: Date | null;
      incident_count: number;
      notification_count: number;
      session_state: string;
      session_version: number;
      task_status: string;
      task_version: number;
    }>(
      `SELECT session.state::text AS session_state,
              session.version AS session_version,
              task.status::text AS task_status, task.version AS task_version,
              task.current_assignee_membership_id::text AS assignee_id,
              tracker.ended_at,
              (SELECT count(*)::integer FROM incidents
               WHERE valet_session_id = session.id) AS incident_count,
              (SELECT count(*)::integer FROM notifications
               WHERE valet_session_id = session.id) AS notification_count,
              (SELECT count(*)::integer FROM dispatch_events
               WHERE task_id = task.id) AS dispatch_count,
              (SELECT count(*)::integer FROM audit_events
               WHERE valet_session_id = session.id) AS audit_count
       FROM valet_sessions AS session
       INNER JOIN tasks AS task ON task.id = $2
       INNER JOIN task_tracking_sessions AS tracker ON tracker.id = $3
       WHERE session.id = $1`,
      [fixture.sessionId, fixture.movementTaskId, fixture.trackingSessionId],
    );
    return result.rows[0]!;
  }
}
