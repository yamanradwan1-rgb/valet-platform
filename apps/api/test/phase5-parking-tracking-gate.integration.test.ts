import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  buildParkingSamples,
  getGeofenceEvents,
  getProtectedStateSnapshot,
  getRawGpsSamples,
  getTrackers,
  queryDbNow,
  seedMapPolygons,
  setTrackingPolicy,
} from "./phase5-tracking-gate-database";
import { Phase5TrackingGateContext } from "./phase5-tracking-gate-test-context";

const context = new Phase5TrackingGateContext("parking");

beforeAll(async () => context.setupGate(), 120_000);
afterAll(async () => context.teardownGate(), 60_000);

describe("VAL-007H Phase 5 Parking tracking gate", () => {
  it("composes tracked Parking lifecycle, geofence rules, Live Map, and Route History", async () => {
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

    expect(
      await getTrackers(context.adminPool, fixture.sessionId),
    ).toHaveLength(0);
    const preGps = buildParkingSamples(await queryDbNow(context.adminPool));
    const earlyGps = await context.staffPost(
      fixture.accessToken,
      `${sessionPath}/tracking/gps-samples`,
      { samples: [preGps[0]!] },
    );
    expect(earlyGps.status).toBe(404);
    expect(earlyGps.body).toEqual({
      code: "TASK_NOT_FOUND_OR_FORBIDDEN",
      message: expect.any(String),
      requestId: expect.any(String),
    });
    expect(
      await getTrackers(context.adminPool, fixture.sessionId),
    ).toHaveLength(0);

    const started = await context.startParking(fixture, flow);
    expect(started.status).toBe(200);
    expect(started.body).toMatchObject({
      state: "PARKING",
      taskStatus: "IN_PROGRESS",
    });

    const activeTrackers = await getTrackers(
      context.adminPool,
      fixture.sessionId,
    );
    expect(activeTrackers).toHaveLength(1);
    const tracker = activeTrackers[0]!;
    expect(tracker.ended_at).toBeNull();
    expect(tracker.organization_id).toBe(fixture.organizationId);
    expect(tracker.location_id).toBe(fixture.locationId);
    expect(tracker.task_id).toBe(flow.taskId);

    const areas = await seedMapPolygons(
      context.adminPool,
      fixture.organizationId,
      fixture.locationId,
    );
    const dbNow = await queryDbNow(context.adminPool);
    expect(dbNow.getTime()).toBeGreaterThanOrEqual(
      tracker.started_at.getTime(),
    );
    const samples = buildParkingSamples(dbNow);

    const preSnapshot = await getProtectedStateSnapshot(
      context.adminPool,
      fixture.sessionId,
      flow.taskId,
      tracker.id,
    );
    const ingested = await context.staffPost(
      fixture.accessToken,
      `${sessionPath}/tracking/gps-samples`,
      { samples },
    );
    expect(ingested.status).toBe(200);
    expect(ingested.body).toEqual({
      samples: samples.map((s) => ({
        clientSampleId: s.clientSampleId,
        status: "ACCEPTED",
      })),
    });

    const rawRows = await getRawGpsSamples(context.adminPool, tracker.id);
    expect(rawRows).toHaveLength(4);
    expect(rawRows[0]!.organization_id).toBe(fixture.organizationId);
    expect(rawRows[0]!.location_id).toBe(fixture.locationId);
    expect(rawRows[0]!.task_id).toBe(flow.taskId);

    const events = await getGeofenceEvents(context.adminPool, tracker.id);
    expect(
      events.map((e) => ({
        event_type: e.event_type,
        map_area_id: e.map_area_id,
        occurred_at: e.occurred_at.toISOString(),
      })),
    ).toEqual([
      {
        event_type: "ENTERED",
        map_area_id: areas.allowedAreaId,
        occurred_at: samples[1]!.capturedAt,
      },
      {
        event_type: "ENTERED",
        map_area_id: areas.restrictedAreaId,
        occurred_at: samples[2]!.capturedAt,
      },
      {
        event_type: "VIOLATION",
        map_area_id: areas.restrictedAreaId,
        occurred_at: samples[2]!.capturedAt,
      },
      {
        event_type: "EXITED",
        map_area_id: areas.allowedAreaId,
        occurred_at: samples[3]!.capturedAt,
      },
      {
        event_type: "EXITED",
        map_area_id: areas.restrictedAreaId,
        occurred_at: samples[3]!.capturedAt,
      },
      {
        event_type: "VIOLATION",
        map_area_id: areas.allowedAreaId,
        occurred_at: samples[3]!.capturedAt,
      },
    ]);

    const postSnapshot = await getProtectedStateSnapshot(
      context.adminPool,
      fixture.sessionId,
      flow.taskId,
      tracker.id,
    );
    expect(postSnapshot).toMatchObject({
      assignee_id: preSnapshot.assignee_id,
      dispatch_count: preSnapshot.dispatch_count,
      incident_count: 0,
      notification_count: 0,
      session_state: preSnapshot.session_state,
      session_version: preSnapshot.session_version,
      task_status: preSnapshot.task_status,
      task_version: preSnapshot.task_version,
      tracker_ended_at: null,
    });

    const retried = await context.staffPost(
      fixture.accessToken,
      `${sessionPath}/tracking/gps-samples`,
      { samples },
    );
    expect(retried.status).toBe(200);
    expect(retried.body).toEqual({
      samples: samples.map((s) => ({
        clientSampleId: s.clientSampleId,
        status: "DUPLICATE",
      })),
    });
    expect(await getRawGpsSamples(context.adminPool, tracker.id)).toHaveLength(
      4,
    );
    expect(await getGeofenceEvents(context.adminPool, tracker.id)).toHaveLength(
      6,
    );

    await context.expectActiveLiveMap(managerToken, fixture.locationId, {
      latitude: 33,
      longitude: 38,
      sessionId: fixture.sessionId,
      taskId: flow.taskId,
      taskType: "PARKING",
      trackingSessionId: tracker.id,
    });

    const routeHistoryActive = await context.staffGet(
      managerToken,
      `/v1/staff/tracking-sessions/${tracker.id}/route-history`,
    );
    expect(routeHistoryActive.status).toBe(404);
    expect(routeHistoryActive.body).toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });

    const parked = await context.confirmParked(fixture, started);
    expect(parked.status).toBe(200);
    expect(parked.body).toMatchObject({
      state: "PARKED",
      taskStatus: "COMPLETED",
    });

    const endedTrackers = await getTrackers(
      context.adminPool,
      fixture.sessionId,
    );
    expect(endedTrackers).toHaveLength(1);
    expect(endedTrackers[0]!.ended_at).not.toBeNull();

    const lateGps = await context.staffPost(
      fixture.accessToken,
      `${sessionPath}/tracking/gps-samples`,
      { samples: [samples[0]!] },
    );
    expect(lateGps.status).toBe(404);
    expect(lateGps.body).toMatchObject({ code: "TASK_NOT_FOUND_OR_FORBIDDEN" });

    const liveMapEnded = await context.staffGet(
      managerToken,
      `/v1/staff/locations/${fixture.locationId}/live-operations-map`,
    );
    expect(liveMapEnded.status).toBe(200);
    expect(liveMapEnded.body).toMatchObject({ items: [] });

    await context.expectEndedRouteHistory(managerToken, tracker.id, [
      { latitude: 33, longitude: 38 },
      { latitude: 31.2, longitude: 35.2 },
      { latitude: 31.5, longitude: 35.5 },
      { latitude: 33, longitude: 38 },
    ]);
  });

  it("handles Parking with tracking policy OFF without tracker or leakage", async () => {
    const fixture = await context.createGateFixture();
    await setTrackingPolicy(
      context.adminPool,
      fixture.organizationId,
      fixture.locationId,
      true,
      false,
    );
    const manager = await context.addMember(fixture, "LOCATION_MANAGER", false);
    const managerToken = await context.authorize(manager.userId);

    const sessionPath = `/v1/staff/valet-sessions/${fixture.sessionId}`;
    const flow = await context.queueAssignAcceptParking(fixture);
    const started = await context.startParking(fixture, flow);
    expect(started.status).toBe(200);
    expect(
      await getTrackers(context.adminPool, fixture.sessionId),
    ).toHaveLength(0);

    const sample = buildParkingSamples(await queryDbNow(context.adminPool))[0]!;
    const gpsDuringParking = await context.staffPost(
      fixture.accessToken,
      `${sessionPath}/tracking/gps-samples`,
      { samples: [sample] },
    );
    expect(gpsDuringParking.status).toBe(409);
    expect(gpsDuringParking.body).toMatchObject({ code: "TASK_INVALID_STATE" });
    expect(
      await getTrackers(context.adminPool, fixture.sessionId),
    ).toHaveLength(0);

    const liveMap = await context.staffGet(
      managerToken,
      `/v1/staff/locations/${fixture.locationId}/live-operations-map`,
    );
    expect(liveMap.status).toBe(200);
    expect(liveMap.body).toMatchObject({ items: [] });

    const parked = await context.confirmParked(fixture, started);
    expect(parked.status).toBe(200);
    expect(
      await getTrackers(context.adminPool, fixture.sessionId),
    ).toHaveLength(0);
  });
});
