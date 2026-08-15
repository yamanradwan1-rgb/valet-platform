import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  buildRetrievalSamples,
  getRawGpsSamples,
  getTrackers,
  queryDbNow,
  setTrackingPolicy,
} from "./phase5-tracking-gate-database";
import {
  num,
  Phase5TrackingGateContext,
} from "./phase5-tracking-gate-test-context";

const context = new Phase5TrackingGateContext("retrieval");

beforeAll(async () => context.setupGate(), 120_000);
afterAll(async () => context.teardownGate(), 60_000);

describe("VAL-007H Phase 5 Retrieval tracking gate", () => {
  it("composes tracked Retrieval lifecycle, Live Map, Mark Ready, and Route History", async () => {
    const parked = await context.createParkedFixture();
    expect(await getTrackers(context.adminPool, parked.sessionId)).toHaveLength(
      0,
    );

    await setTrackingPolicy(
      context.adminPool,
      parked.organizationId,
      parked.locationId,
      true,
      null,
    );
    const manager = await context.addMember(parked, "LOCATION_MANAGER", false);
    const managerToken = await context.authorize(manager.userId);

    const requested = await context.requestRetrieval(parked);
    const owned = await context.assignAndAccept(requested);
    const sessionPath = `/v1/staff/valet-sessions/${owned.sessionId}`;

    const earlySamples = buildRetrievalSamples(
      await queryDbNow(context.adminPool),
    );
    const earlyGps = await context.staffPost(
      owned.accessToken,
      `${sessionPath}/tracking/gps-samples`,
      { samples: [earlySamples[0]!] },
    );
    expect(earlyGps.status).toBe(404);
    expect(earlyGps.body).toEqual({
      code: "TASK_NOT_FOUND_OR_FORBIDDEN",
      message: expect.any(String),
      requestId: expect.any(String),
    });
    expect(await getTrackers(context.adminPool, owned.sessionId)).toHaveLength(
      0,
    );

    const started = await context.staffPost(
      owned.accessToken,
      `${sessionPath}/start-retrieval`,
      {
        expectedSessionVersion: owned.sessionVersion,
        expectedTaskVersion: owned.taskVersion,
      },
    );
    expect(started.status).toBe(200);
    expect(started.body).toMatchObject({
      state: "RETRIEVING",
      taskStatus: "IN_PROGRESS",
    });

    const activeTrackers = await getTrackers(
      context.adminPool,
      owned.sessionId,
    );
    expect(activeTrackers).toHaveLength(1);
    const tracker = activeTrackers[0]!;
    expect(tracker.ended_at).toBeNull();
    expect(tracker.organization_id).toBe(owned.organizationId);
    expect(tracker.location_id).toBe(owned.locationId);
    expect(tracker.task_id).toBe(owned.taskId);

    const dbNow = await queryDbNow(context.adminPool);
    expect(dbNow.getTime()).toBeGreaterThanOrEqual(
      tracker.started_at.getTime(),
    );
    const samples = buildRetrievalSamples(dbNow);

    const ingested = await context.staffPost(
      owned.accessToken,
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
    expect(rawRows).toHaveLength(2);
    expect(rawRows[0]!.organization_id).toBe(owned.organizationId);
    expect(rawRows[0]!.location_id).toBe(owned.locationId);
    expect(rawRows[0]!.task_id).toBe(owned.taskId);

    const liveMapActive = await context.staffGet(
      managerToken,
      `/v1/staff/locations/${owned.locationId}/live-operations-map`,
    );
    expect(liveMapActive.status).toBe(200);
    expect(liveMapActive.body).toMatchObject({
      items: [
        {
          position: {
            areas: [],
            freshness: "LIVE",
            latitude: 31.2,
            longitude: 35.2,
          },
          sessionState: "RETRIEVING",
          taskId: owned.taskId,
          taskType: "RETRIEVAL",
          trackingSessionId: tracker.id,
          valetSessionId: owned.sessionId,
        },
      ],
    });

    const routeHistoryActive = await context.staffGet(
      managerToken,
      `/v1/staff/tracking-sessions/${tracker.id}/route-history`,
    );
    expect(routeHistoryActive.status).toBe(404);
    expect(routeHistoryActive.body).toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });

    const ready = await context.staffPost(
      owned.accessToken,
      `${sessionPath}/mark-ready`,
      { expectedSessionVersion: num(started.body, "sessionVersion") },
    );
    expect(ready.status).toBe(200);
    expect(ready.body).toMatchObject({
      state: "READY",
      taskStatus: "IN_PROGRESS",
    });

    const endedTrackers = await getTrackers(context.adminPool, owned.sessionId);
    expect(endedTrackers).toHaveLength(1);
    expect(endedTrackers[0]!.ended_at).not.toBeNull();

    const lateGps = await context.staffPost(
      owned.accessToken,
      `${sessionPath}/tracking/gps-samples`,
      { samples: [samples[0]!] },
    );
    expect(lateGps.status).toBe(409);
    expect(lateGps.body).toMatchObject({ code: "TASK_INVALID_STATE" });
    expect(await getRawGpsSamples(context.adminPool, tracker.id)).toHaveLength(
      2,
    );

    const liveMapEnded = await context.staffGet(
      managerToken,
      `/v1/staff/locations/${owned.locationId}/live-operations-map`,
    );
    expect(liveMapEnded.status).toBe(200);
    expect(liveMapEnded.body).toMatchObject({ items: [] });

    const routeHistoryEnded = await context.staffGet(
      managerToken,
      `/v1/staff/tracking-sessions/${tracker.id}/route-history`,
    );
    expect(routeHistoryEnded.status).toBe(200);
    expect(routeHistoryEnded.body).toMatchObject({
      nextCursor: null,
      samples: [
        { latitude: 31.5, longitude: 35.5 },
        { latitude: 31.2, longitude: 35.2 },
      ],
    });
  });

  it("handles Retrieval with tracking policy OFF without tracker or leakage", async () => {
    const parked = await context.createParkedFixture();
    await setTrackingPolicy(
      context.adminPool,
      parked.organizationId,
      parked.locationId,
      false,
      null,
    );
    const manager = await context.addMember(parked, "LOCATION_MANAGER", false);
    const managerToken = await context.authorize(manager.userId);

    const requested = await context.requestRetrieval(parked);
    const owned = await context.assignAndAccept(requested);
    const sessionPath = `/v1/staff/valet-sessions/${owned.sessionId}`;

    const started = await context.staffPost(
      owned.accessToken,
      `${sessionPath}/start-retrieval`,
      {
        expectedSessionVersion: owned.sessionVersion,
        expectedTaskVersion: owned.taskVersion,
      },
    );
    expect(started.status).toBe(200);
    expect(await getTrackers(context.adminPool, owned.sessionId)).toHaveLength(
      0,
    );

    const sample = buildRetrievalSamples(
      await queryDbNow(context.adminPool),
    )[0]!;
    const gpsDuringRetrieving = await context.staffPost(
      owned.accessToken,
      `${sessionPath}/tracking/gps-samples`,
      { samples: [sample] },
    );
    expect(gpsDuringRetrieving.status).toBe(409);
    expect(gpsDuringRetrieving.body).toMatchObject({
      code: "TASK_INVALID_STATE",
    });
    expect(await getTrackers(context.adminPool, owned.sessionId)).toHaveLength(
      0,
    );

    const liveMap = await context.staffGet(
      managerToken,
      `/v1/staff/locations/${owned.locationId}/live-operations-map`,
    );
    expect(liveMap.status).toBe(200);
    expect(liveMap.body).toMatchObject({ items: [] });

    const ready = await context.staffPost(
      owned.accessToken,
      `${sessionPath}/mark-ready`,
      { expectedSessionVersion: num(started.body, "sessionVersion") },
    );
    expect(ready.status).toBe(200);
    expect(ready.body).toMatchObject({
      state: "READY",
      taskStatus: "IN_PROGRESS",
    });
    expect(await getTrackers(context.adminPool, owned.sessionId)).toHaveLength(
      0,
    );
  });
});
