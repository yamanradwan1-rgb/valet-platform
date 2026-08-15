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
    const started = await context.staffPost(
      fixture.accessToken,
      `${sessionPath}/start-parking`,
      {
        expectedSessionVersion: flow.keyAssignedSessionVersion,
        expectedTaskVersion: flow.taskVersion,
      },
    );
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

    await context.staffPost(
      fixture.accessToken,
      `${sessionPath}/confirm-parked`,
      {
        expectedSessionVersion: num(started.body, "sessionVersion"),
        expectedTaskVersion: num(started.body, "taskVersion"),
        parkingSpotCode: fixture.parkingSpotCode,
      },
    );

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
    await context.staffPost(
      fixture.accessToken,
      `${sessionPath}/start-parking`,
      {
        expectedSessionVersion: flow.keyAssignedSessionVersion,
        expectedTaskVersion: flow.taskVersion,
      },
    );
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

    const auditEvents = await context.adminPool.query<{
      metadata_json: unknown;
    }>(`SELECT metadata_json FROM audit_events WHERE valet_session_id = $1`, [
      fixture.sessionId,
    ]);
    const auditStr = JSON.stringify(auditEvents.rows);
    expect(auditStr).not.toContain(context.providerSecretSentinel);

    const rawGps = await context.adminPool.query<{ id: string }>(
      `SELECT id::text FROM raw_gps_samples WHERE tracking_session_id = $1`,
      [tracker.id],
    );
    expect(JSON.stringify(rawGps.rows)).not.toContain(
      context.providerSecretSentinel,
    );
  });
});
