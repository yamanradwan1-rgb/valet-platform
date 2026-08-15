import { randomUUID } from "node:crypto";

import { createLiveMapQuery } from "../src/modules/tracking/live-map-query";
import type { TestRole } from "./shift-test-context";
import {
  RouteHistoryTestContext,
  expectRouteDenied,
} from "./route-history-test-context";
import type { TrackingFixture } from "./gps-ingestion-test-context";

export { expectRouteDenied as expectLiveMapDenied };

export class LiveMapTestContext extends RouteHistoryTestContext {
  constructor(label: string) {
    super(`007g_${label}`);
  }

  liveQuery(input: {
    authenticatedUserId: string;
    cursor?: string;
    limit?: number;
    locationId: string;
  }) {
    return createLiveMapQuery(this.runtimePool)({
      authenticatedUserId: input.authenticatedUserId,
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      limit: input.limit ?? 100,
      locationId: input.locationId,
    });
  }

  async manager(fixture: TrackingFixture) {
    return this.createActor(fixture, "LOCATION_MANAGER");
  }

  supervisor(fixture: TrackingFixture, activeShift = true) {
    return this.createActor(fixture, "VALET_SUPERVISOR", { activeShift });
  }

  actor(fixture: TrackingFixture, role: TestRole) {
    return this.createActor(fixture, role);
  }

  async setPolicy(fixture: TrackingFixture, enabled: boolean) {
    await this.adminPool.query(
      `UPDATE locations SET tracking_enabled_override = $2,
              updated_at = transaction_timestamp() WHERE id = $1`,
      [fixture.locationId, enabled],
    );
  }

  async seedSample(
    fixture: TrackingFixture,
    input: {
      capturedAt: Date;
      id?: string;
      latitude?: number;
      longitude?: number;
    },
  ) {
    await this.adminPool.query(
      `INSERT INTO raw_gps_samples
       (id, organization_id, location_id, valet_session_id, task_id,
        tracking_session_id, client_sample_id, latitude, longitude, captured_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        input.id ?? randomUUID(),
        fixture.organizationId,
        fixture.locationId,
        fixture.sessionId,
        fixture.movementTaskId,
        fixture.trackingSessionId,
        randomUUID(),
        input.latitude ?? 31.5,
        input.longitude ?? 35.5,
        input.capturedAt,
      ],
    );
  }

  async addArea(
    fixture: TrackingFixture,
    options: {
      active?: boolean;
      code?: string;
      parkingZoneId?: string | null;
      purpose?: "PARKING" | "OVERFLOW" | "STAGING" | "RESTRICTED";
    } = {},
  ) {
    const areaId = randomUUID();
    await this.adminPool.query(
      `INSERT INTO location_map_areas
       (id, organization_id, location_id, parking_zone_id, purpose, code,
        label, level_label, active, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'Live area', 'B1', $7,
               transaction_timestamp())`,
      [
        areaId,
        fixture.organizationId,
        fixture.locationId,
        options.parkingZoneId ?? null,
        options.purpose ?? "PARKING",
        options.code ?? randomUUID(),
        options.active ?? true,
      ],
    );
    const vertices = [
      [31, 35],
      [31, 36],
      [32, 36],
      [32, 35],
    ];
    await this.adminPool.query(
      `INSERT INTO location_map_area_vertices
       (id, organization_id, location_id, map_area_id, position, latitude, longitude)
       SELECT input.id, $2, $3, $1, input.position, input.latitude, input.longitude
       FROM unnest($4::uuid[], $5::integer[], $6::numeric[], $7::numeric[])
         AS input(id, position, latitude, longitude)`,
      [
        areaId,
        fixture.organizationId,
        fixture.locationId,
        vertices.map(() => randomUUID()),
        vertices.map((_, index) => index),
        vertices.map(([latitude]) => latitude),
        vertices.map(([, longitude]) => longitude),
      ],
    );
    return areaId;
  }

  async addParkingWork(fixture: TrackingFixture, startedAt: Date) {
    const vehicleId = randomUUID();
    const sessionId = randomUUID();
    const taskId = randomUUID();
    const trackingSessionId = randomUUID();
    await this.adminPool.query(
      `INSERT INTO vehicles
         (id, organization_id, temporary_descriptor, updated_at)
       VALUES ($1, $2, 'Additional live vehicle', transaction_timestamp())`,
      [vehicleId, fixture.organizationId],
    );
    await this.adminPool.query(
      `INSERT INTO valet_sessions
         (id, customer_access_token_hash, customer_access_expires_at,
          organization_id, location_id, vehicle_id, state,
          current_assignee_membership_id, checked_in_by_membership_id, updated_at)
       VALUES ($1, $2, transaction_timestamp() + interval '1 day', $3, $4, $5,
               'PARKING', $6, $6, transaction_timestamp())`,
      [
        sessionId,
        randomUUID(),
        fixture.organizationId,
        fixture.locationId,
        vehicleId,
        fixture.membershipId,
      ],
    );
    await this.adminPool.query(
      `INSERT INTO tasks
         (id, organization_id, location_id, valet_session_id, task_type,
          status, current_assignee_membership_id, updated_at)
       VALUES ($1, $2, $3, $4, 'PARKING', 'IN_PROGRESS', $5,
               transaction_timestamp())`,
      [
        taskId,
        fixture.organizationId,
        fixture.locationId,
        sessionId,
        fixture.membershipId,
      ],
    );
    await this.adminPool.query(
      `INSERT INTO task_tracking_sessions
         (id, organization_id, location_id, valet_session_id, task_id, started_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        trackingSessionId,
        fixture.organizationId,
        fixture.locationId,
        sessionId,
        taskId,
        startedAt,
      ],
    );
    return { sessionId, startedAt, taskId, trackingSessionId, vehicleId };
  }
}
