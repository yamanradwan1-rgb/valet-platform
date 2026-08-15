import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ageRawGpsSample,
  buildParkingSamples,
  executeRetentionCleanup,
  getGeofenceEvents,
  getProtectedStateSnapshot,
  getRawGpsSamples,
  getTrackers,
  queryDbNow,
  seedMapPolygons,
  setRetentionPolicy,
  setTrackingPolicy,
} from "./phase5-tracking-gate-database";
import {
  num,
  Phase5TrackingGateContext,
} from "./phase5-tracking-gate-test-context";

const context = new Phase5TrackingGateContext("retention_privacy");

beforeAll(async () => context.setupGate(), 120_000);
afterAll(async () => context.teardownGate(), 60_000);

describe("VAL-007H Phase 5 Retention and Privacy gate", () => {
  it("composes raw GPS retention cleanup while preserving business history and ended route", async () => {
    const fixture = await context.createGateFixture();
    await setTrackingPolicy(
      context.adminPool,
      fixture.organizationId,
      fixture.locationId,
      false,
      true,
    );

    const manager = await context.addMember(fixture, "LOCATION_MANAGER", false);
    const managerToken = await context.authorize(manager.userId);

    const sessionPath = `/v1/staff/valet-sessions/${fixture.sessionId}`;
    const flow = await context.queueAssignAcceptParking(fixture);
    const started = await context.startParking(fixture, flow);
    expect(started.status).toBe(200);

    const tracker = (
      await getTrackers(context.adminPool, fixture.sessionId)
    )[0]!;
    await seedMapPolygons(
      context.adminPool,
      fixture.organizationId,
      fixture.locationId,
    );

    const dbNow = await queryDbNow(context.adminPool);
    const samples = buildParkingSamples(dbNow);
    await context.staffPost(
      fixture.accessToken,
      `${sessionPath}/tracking/gps-samples`,
      { samples },
    );

    const rawBefore = await getRawGpsSamples(context.adminPool, tracker.id);
    expect(rawBefore.length).toBeGreaterThanOrEqual(2);
    const geofenceBefore = await getGeofenceEvents(
      context.adminPool,
      tracker.id,
    );
    expect(geofenceBefore.length).toBeGreaterThanOrEqual(1);

    await context.confirmParked(fixture, started);

    const routeBefore = await context.staffGet(
      managerToken,
      `/v1/staff/tracking-sessions/${tracker.id}/route-history`,
    );
    expect(routeBefore.status).toBe(200);
    expect((routeBefore.body.samples as unknown[]).length).toBe(4);

    await setRetentionPolicy(
      context.adminPool,
      fixture.organizationId,
      fixture.locationId,
      30,
      null,
    );
    await ageRawGpsSample(context.adminPool, rawBefore[0]!.id, 31);

    const preSnapshot = await getProtectedStateSnapshot(
      context.adminPool,
      fixture.sessionId,
      flow.taskId,
      tracker.id,
    );
    expect(preSnapshot.key_custody_count).toBeGreaterThan(0);

    const deleted = await executeRetentionCleanup(context.runtimePool, 1000);
    expect(deleted).toBe(1);

    const routeAfter = await context.staffGet(
      managerToken,
      `/v1/staff/tracking-sessions/${tracker.id}/route-history`,
    );
    expect(routeAfter.status).toBe(200);
    expect((routeAfter.body.samples as unknown[]).length).toBe(3);

    const postSnapshot = await getProtectedStateSnapshot(
      context.adminPool,
      fixture.sessionId,
      flow.taskId,
      tracker.id,
    );
    expect(postSnapshot.session_state).toBe(preSnapshot.session_state);
    expect(postSnapshot.session_version).toBe(preSnapshot.session_version);
    expect(postSnapshot.task_status).toBe(preSnapshot.task_status);
    expect(postSnapshot.task_version).toBe(preSnapshot.task_version);
    expect(postSnapshot.tracker_ended_at).toEqual(preSnapshot.tracker_ended_at);
    expect(postSnapshot.audit_count).toBe(preSnapshot.audit_count);
    expect(postSnapshot.dispatch_count).toBe(preSnapshot.dispatch_count);
    expect(postSnapshot.key_custody_count).toBe(preSnapshot.key_custody_count);
    expect(postSnapshot.geofence_count).toBe(preSnapshot.geofence_count);
    expect(postSnapshot.raw_count).toBe(preSnapshot.raw_count - 1);
  });

  it("enforces strict guest privacy and protects provider secrets", async () => {
    const fixture = await context.createGateFixture();
    await setTrackingPolicy(
      context.adminPool,
      fixture.organizationId,
      fixture.locationId,
      false,
      true,
    );

    const sessionPath = `/v1/staff/valet-sessions/${fixture.sessionId}`;
    const flow = await context.queueAssignAcceptParking(fixture);
    await context.startParking(fixture, flow);
    const tracker = (
      await getTrackers(context.adminPool, fixture.sessionId)
    )[0]!;
    const sample = buildParkingSamples(await queryDbNow(context.adminPool))[0]!;
    await context.staffPost(
      fixture.accessToken,
      `${sessionPath}/tracking/gps-samples`,
      { samples: [sample] },
    );

    const guest = await context.guestGet(fixture.guestToken);
    expect(guest.status).toBe(200);
    expect(guest.headers.get("cache-control")).toBe("no-store");
    expect(guest.body).toMatchObject({
      state: "PARKING",
      valetSessionId: fixture.sessionId,
      vehicle: expect.any(Object),
    });

    const guestStr = JSON.stringify(guest.body);
    expect(guestStr).not.toMatch(
      /latitude|longitude|trackingSessionId|taskId|assignee|membership|LIVE|STALE|freshness|mapArea|polygon|organizationId|locationId/i,
    );
    expect(guestStr).not.toContain(context.providerSecretSentinel);

    const gpsDenied = await context.staffPost(
      fixture.guestToken,
      `${sessionPath}/tracking/gps-samples`,
      { samples: [sample] },
    );
    expect(gpsDenied.status).toBe(401);

    const liveDenied = await context.staffGet(
      fixture.guestToken,
      `/v1/staff/locations/${fixture.locationId}/live-operations-map`,
    );
    expect(liveDenied.status).toBe(401);

    const routeDenied = await context.staffGet(
      fixture.guestToken,
      `/v1/staff/tracking-sessions/${tracker.id}/route-history`,
    );
    expect(routeDenied.status).toBe(401);

    const manager = await context.addMember(fixture, "LOCATION_MANAGER", false);
    const managerToken = await context.authorize(manager.userId);
    const liveMap = await context.staffGet(
      managerToken,
      `/v1/staff/locations/${fixture.locationId}/live-operations-map`,
    );
    expect(liveMap.status).toBe(200);
    expect(JSON.stringify(liveMap.body)).not.toContain(
      context.providerSecretSentinel,
    );

    const rejectedGps = await context.staffPost(
      fixture.accessToken,
      `${sessionPath}/tracking/gps-samples`,
      {
        samples: [
          {
            accuracyMeters: -5,
            capturedAt: "invalid",
            clientSampleId: "not-uuid",
            latitude: 999,
            longitude: 999,
          },
        ],
      },
    );
    expect(rejectedGps.status).toBe(400);
    expect(JSON.stringify(rejectedGps.body)).not.toContain(
      context.providerSecretSentinel,
    );

    const [tasks, sessions, trackers, rawSamples, geofenceRows, auditRows] =
      await Promise.all([
        context.adminPool.query(
          `SELECT id::text, organization_id::text, location_id::text, valet_session_id::text,
                  task_type::text, status::text, current_assignee_membership_id::text, version
           FROM tasks WHERE id = $1`,
          [flow.taskId],
        ),
        context.adminPool.query(
          `SELECT id::text, organization_id::text, location_id::text, vehicle_id::text,
                  customer_id::text, state::text, version, parking_zone_id::text,
                  parking_spot_id::text, key_slot_id::text, current_assignee_membership_id::text
           FROM valet_sessions WHERE id = $1`,
          [fixture.sessionId],
        ),
        context.adminPool.query(
          `SELECT id::text, organization_id::text, location_id::text, valet_session_id::text,
                  task_id::text, started_at, ended_at
           FROM task_tracking_sessions WHERE id = $1`,
          [tracker.id],
        ),
        context.adminPool.query(
          `SELECT id::text, organization_id::text, location_id::text, valet_session_id::text,
                  task_id::text, tracking_session_id::text, client_sample_id::text,
                  latitude::text, longitude::text, captured_at, received_at
           FROM raw_gps_samples WHERE tracking_session_id = $1`,
          [tracker.id],
        ),
        context.adminPool.query(
          `SELECT id::text, organization_id::text, location_id::text, valet_session_id::text,
                  task_id::text, tracking_session_id::text, map_area_id::text,
                  event_type::text, occurred_at, recorded_at
           FROM geofence_events WHERE tracking_session_id = $1`,
          [tracker.id],
        ),
        context.adminPool.query(
          `SELECT id::text, event_type::text, metadata_json
           FROM audit_events WHERE valet_session_id = $1`,
          [fixture.sessionId],
        ),
      ]);

    for (const rows of [
      tasks.rows,
      sessions.rows,
      trackers.rows,
      rawSamples.rows,
      geofenceRows.rows,
      auditRows.rows,
    ]) {
      expect(JSON.stringify(rows)).not.toContain(
        context.providerSecretSentinel,
      );
    }
  });
});
