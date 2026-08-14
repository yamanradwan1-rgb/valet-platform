import { randomUUID } from "node:crypto";

import type { GpsIngestionRequest } from "@valet/contracts";

import { createGpsIngestionCommandExecutor } from "../src/modules/tracking/gps-ingestion-command";
import type { GpsSampleResult } from "../src/modules/tracking/gps-ingestion-types";
import { createMarkReadyCommandExecutor } from "../src/modules/retrieval/mark-ready-command";
import type { TestRole } from "./shift-test-context";
import type { ConfirmParkedFixture } from "./confirm-parked-test-context";
import {
  StartRetrievalTestContext,
  type StartRetrievalFixture,
} from "./start-retrieval-test-context";

export interface TrackingFixture {
  readonly locationId: string;
  readonly membershipId: string;
  readonly movementTaskId: string;
  readonly organizationId: string;
  readonly sessionId: string;
  readonly trackerStartedAt: Date;
  readonly trackingSessionId: string;
  readonly userId: string;
}

export class GpsIngestionTestContext extends StartRetrievalTestContext {
  constructor(label: string) {
    super(`007d_${label}`);
  }

  private async enableTracking(organizationId: string): Promise<void> {
    await this.adminPool.query(
      `UPDATE organizations SET tracking_enabled = true,
              updated_at = transaction_timestamp() WHERE id = $1`,
      [organizationId],
    );
  }

  private async tracker(
    sessionId: string,
    taskId: string,
  ): Promise<{ id: string; started_at: Date }> {
    const result = await this.adminPool.query<{
      id: string;
      started_at: Date;
    }>(
      `SELECT id::text, started_at FROM task_tracking_sessions
       WHERE valet_session_id = $1 AND task_id = $2 AND ended_at IS NULL`,
      [sessionId, taskId],
    );
    return result.rows[0]!;
  }

  async createParkingTrackingFixture(
    role: TestRole = "VALET_EMPLOYEE",
  ): Promise<TrackingFixture> {
    const fixture = await this.createStartParkingFixture({ role });
    await this.enableTracking(fixture.organizationId);
    await this.start(fixture);
    const tracker = await this.tracker(fixture.sessionId, fixture.taskId);
    return {
      ...fixture,
      movementTaskId: fixture.taskId,
      trackerStartedAt: tracker.started_at,
      trackingSessionId: tracker.id,
    };
  }

  async createRetrievalTrackingFixture(): Promise<
    TrackingFixture & { readonly source: StartRetrievalFixture }
  > {
    const fixture = await this.createStartRetrievalFixture();
    await this.enableTracking(fixture.organizationId);
    await this.startRetrieval(fixture);
    const tracker = await this.tracker(
      fixture.sessionId,
      fixture.retrievalTaskId,
    );
    return {
      ...fixture,
      movementTaskId: fixture.retrievalTaskId,
      source: fixture,
      trackerStartedAt: tracker.started_at,
      trackingSessionId: tracker.id,
    };
  }

  async createParkingCompletionFixture(): Promise<{
    readonly source: ConfirmParkedFixture;
    readonly tracking: TrackingFixture;
  }> {
    const fixture = await this.createStartParkingFixture();
    await this.enableTracking(fixture.organizationId);
    await this.start(fixture);
    const resource = await this.addParkingResource(fixture);
    const tracker = await this.tracker(fixture.sessionId, fixture.taskId);
    const source: ConfirmParkedFixture = {
      ...fixture,
      parkingSpotCode: resource.spot.code,
      parkingSpotId: resource.spot.id,
      parkingZoneId: resource.zone.id,
    };
    return {
      source,
      tracking: {
        ...fixture,
        movementTaskId: fixture.taskId,
        trackerStartedAt: tracker.started_at,
        trackingSessionId: tracker.id,
      },
    };
  }

  async databaseTime(): Promise<Date> {
    const result = await this.adminPool.query<{ now: Date }>(
      `SELECT transaction_timestamp()::timestamptz(3) AS now`,
    );
    return result.rows[0]!.now;
  }

  async sample(
    overrides: Partial<GpsIngestionRequest["samples"][number]> = {},
  ): Promise<GpsIngestionRequest["samples"][number]> {
    return {
      accuracyMeters: 8,
      capturedAt: (await this.databaseTime()).toISOString(),
      clientSampleId: randomUUID(),
      latitude: 31.9539,
      longitude: 35.9106,
      ...overrides,
    };
  }

  ingest(
    fixture: TrackingFixture,
    samples: readonly GpsIngestionRequest["samples"][number][],
    userId = fixture.userId,
  ): Promise<readonly GpsSampleResult[]> {
    return createGpsIngestionCommandExecutor(this.runtimePool)({
      authenticatedUserId: userId,
      samples,
      sessionId: fixture.sessionId,
    });
  }

  markReady(fixture: StartRetrievalFixture) {
    return createMarkReadyCommandExecutor(this.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedSessionVersion: 6,
      sessionId: fixture.sessionId,
    });
  }

  async rawSamples(fixture: TrackingFixture) {
    const result = await this.adminPool.query<{
      captured_at: Date;
      client_sample_id: string;
      latitude: string;
      longitude: string;
      received_at: Date;
    }>(
      `SELECT client_sample_id::text, latitude::text, longitude::text,
              captured_at, received_at FROM raw_gps_samples
       WHERE tracking_session_id = $1 ORDER BY captured_at, id`,
      [fixture.trackingSessionId],
    );
    return result.rows;
  }

  async trackingCounts(fixture: TrackingFixture) {
    const result = await this.adminPool.query<{
      audit_count: number;
      geofence_count: number;
      raw_count: number;
    }>(
      `SELECT
         (SELECT count(*)::integer FROM raw_gps_samples
          WHERE tracking_session_id = $1) AS raw_count,
         (SELECT count(*)::integer FROM geofence_events
          WHERE tracking_session_id = $1) AS geofence_count,
         (SELECT count(*)::integer FROM audit_events
          WHERE valet_session_id = $2) AS audit_count`,
      [fixture.trackingSessionId, fixture.sessionId],
    );
    return result.rows[0]!;
  }
}
