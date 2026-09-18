import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  buildParkingSamples,
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

const context = new Phase5TrackingGateContext("security");

beforeAll(async () => context.setupGate(), 120_000);
afterAll(async () => context.teardownGate(), 60_000);

describe("VAL-007H Phase 5 Security gate", () => {
  it("enforces tenant, location, assignee, and shift isolation on GPS ingestion", async () => {
    const fixture = await context.createGateFixture();
    await setTrackingPolicy(
      context.adminPool,
      fixture.organizationId,
      fixture.locationId,
      false,
      true,
    );

    const foreign = await context.createGateFixture();
    const otherLocationToken = await context.authorizeWrongLocation(fixture);
    const otherEmployee = await context.addMember(fixture, "VALET_EMPLOYEE");
    const otherEmployeeToken = await context.authorize(otherEmployee.userId);

    const sessionPath = `/v1/staff/valet-sessions/${fixture.sessionId}`;
    const flow = await context.queueAssignAcceptParking(fixture);
    const started = await context.startParking(fixture, flow);
    expect(started.status).toBe(200);

    const tracker = (
      await getTrackers(context.adminPool, fixture.sessionId)
    )[0]!;
    const sample = buildParkingSamples(await queryDbNow(context.adminPool))[0]!;

    const nonexistent = await context.staffPost(
      fixture.accessToken,
      `/v1/staff/valet-sessions/${randomUUID()}/tracking/gps-samples`,
      { samples: [sample] },
    );
    expect(nonexistent.status).toBe(404);
    expect(nonexistent.body).toMatchObject({
      code: "TASK_NOT_FOUND_OR_FORBIDDEN",
    });

    for (const token of [
      foreign.accessToken,
      otherLocationToken,
      otherEmployeeToken,
    ]) {
      const denied = await context.staffPost(
        token,
        `${sessionPath}/tracking/gps-samples`,
        { samples: [sample] },
      );
      expect(denied.status).toBe(404);
      expect(denied.body).toEqual({
        code: "TASK_NOT_FOUND_OR_FORBIDDEN",
        message: nonexistent.body.message,
        requestId: expect.any(String),
      });
    }

    const guestDenied = await context.staffPost(
      fixture.guestToken,
      `${sessionPath}/tracking/gps-samples`,
      { samples: [sample] },
    );
    expect(guestDenied.status).toBe(401);
    const anonDenied = await context.request(
      "POST",
      `${sessionPath}/tracking/gps-samples`,
      { body: { samples: [sample] } },
    );
    expect(anonDenied.status).toBe(401);
    const badBearerDenied = await context.staffPost(
      "invalid-bearer",
      `${sessionPath}/tracking/gps-samples`,
      { samples: [sample] },
    );
    expect(badBearerDenied.status).toBe(401);

    expect(await getRawGpsSamples(context.adminPool, tracker.id)).toHaveLength(
      0,
    );

    await context.adminPool.query(
      `UPDATE shifts SET status = 'ENDED', ended_at = clock_timestamp() WHERE id = $1`,
      [fixture.shiftId],
    );
    const endedShiftGps = await context.staffPost(
      fixture.accessToken,
      `${sessionPath}/tracking/gps-samples`,
      { samples: [sample] },
    );
    expect(endedShiftGps.status).toBe(404);
    expect(endedShiftGps.body).toMatchObject({
      code: "TASK_NOT_FOUND_OR_FORBIDDEN",
    });
    expect(await getRawGpsSamples(context.adminPool, tracker.id)).toHaveLength(
      0,
    );
  });

  it("transfers GPS ingestion authority on task reassignment", async () => {
    const parked = await context.createParkedFixture();
    await setTrackingPolicy(
      context.adminPool,
      parked.organizationId,
      parked.locationId,
      true,
      null,
    );

    const [empA, empB, sup] = await Promise.all([
      context.addMember(parked, "VALET_EMPLOYEE"),
      context.addMember(parked, "VALET_EMPLOYEE"),
      context.addMember(parked, "VALET_SUPERVISOR"),
    ]);
    const [empAToken, empBToken, supToken] = await Promise.all([
      context.authorize(empA.userId),
      context.authorize(empB.userId),
      context.authorize(sup.userId),
    ]);
    const empAOwner = { ...empA, accessToken: empAToken };
    const empBOwner = { ...empB, accessToken: empBToken };
    const supOwner = { ...sup, accessToken: supToken };

    const req = await context.requestRetrieval(parked);
    const first = await context.assignAndAccept(req, empAOwner, supOwner);

    const reassigned = await context.staffPost(
      supOwner.accessToken,
      `/v1/staff/tasks/${req.taskId}/reassign`,
      {
        expectedVersion: first.taskVersion,
        reason: "Security reassignment test",
        targetAssigneeMembershipId: empB.membershipId,
      },
    );
    expect(reassigned.status).toBe(200);

    const sessionPath = `/v1/staff/valet-sessions/${req.sessionId}`;
    const started = await context.staffPost(
      empBOwner.accessToken,
      `${sessionPath}/start-retrieval`,
      {
        expectedSessionVersion: req.sessionVersion,
        expectedTaskVersion: num(reassigned.body, "version"),
      },
    );
    expect(started.status).toBe(200);

    const sample = buildRetrievalSamples(
      await queryDbNow(context.adminPool),
    )[0]!;
    const deniedOld = await context.staffPost(
      empAOwner.accessToken,
      `${sessionPath}/tracking/gps-samples`,
      { samples: [sample] },
    );
    expect(deniedOld.status).toBe(404);
    expect(deniedOld.body).toMatchObject({
      code: "TASK_NOT_FOUND_OR_FORBIDDEN",
    });

    const acceptedNew = await context.staffPost(
      empBOwner.accessToken,
      `${sessionPath}/tracking/gps-samples`,
      { samples: [sample] },
    );
    expect(acceptedNew.status).toBe(200);
    expect(acceptedNew.body).toMatchObject({
      samples: [{ status: "ACCEPTED" }],
    });
  });

  it("enforces least privilege and non-disclosing boundaries on Live Map and Route History", async () => {
    const fixture = await context.createGateFixture();
    await setTrackingPolicy(
      context.adminPool,
      fixture.organizationId,
      fixture.locationId,
      false,
      true,
    );

    const manager = await context.addMember(fixture, "LOCATION_MANAGER", false);
    const supervisor = await context.addMember(fixture, "VALET_SUPERVISOR");
    const foreign = await context.createGateFixture();
    const foreignManager = await context.addMember(
      foreign,
      "LOCATION_MANAGER",
      false,
    );
    const orgAdmin = await context.addMember(fixture, "ORG_ADMIN", false);

    const [
      managerToken,
      supervisorToken,
      foreignManagerToken,
      otherLocSupervisorToken,
      orgAdminToken,
    ] = await Promise.all([
      context.authorize(manager.userId),
      context.authorize(supervisor.userId),
      context.authorize(foreignManager.userId),
      context.authorizeWrongLocation(fixture),
      context.authorize(orgAdmin.userId),
    ]);

    const flow = await context.queueAssignAcceptParking(fixture);
    const started = await context.startParking(fixture, flow);
    const tracker = (
      await getTrackers(context.adminPool, fixture.sessionId)
    )[0]!;
    const sample = buildParkingSamples(await queryDbNow(context.adminPool))[0]!;
    await context.staffPost(
      fixture.accessToken,
      `/v1/staff/valet-sessions/${fixture.sessionId}/tracking/gps-samples`,
      { samples: [sample] },
    );
    await context.adminPool.query(
      `UPDATE organization_subscriptions
       SET dashboard_access_enabled=TRUE, updated_at=clock_timestamp()
       WHERE organization_id=$1`,
      [fixture.organizationId],
    );

    const unauthorizedTokens = [
      foreignManagerToken,
      otherLocSupervisorToken,
      fixture.accessToken,
      orgAdminToken,
    ];

    const assertBoundary = async (path: string, randomPath: string) => {
      const random = await context.staffGet(managerToken, randomPath);
      expect(random.status).toBe(404);
      expect(random.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
      for (const token of unauthorizedTokens) {
        const denied = await context.staffGet(token, path);
        expect(denied.status).toBe(404);
        expect(denied.body).toEqual({
          code: "AUTHORIZATION_DENIED",
          message: random.body.message,
          requestId: expect.any(String),
        });
      }
      expect((await context.staffGet(managerToken, path)).status).toBe(200);
      expect((await context.staffGet(supervisorToken, path)).status).toBe(200);
      expect((await context.staffGet(fixture.guestToken, path)).status).toBe(
        401,
      );
      expect((await context.request("GET", path)).status).toBe(401);
    };

    await assertBoundary(
      `/v1/staff/locations/${fixture.locationId}/live-operations-map`,
      `/v1/staff/locations/${randomUUID()}/live-operations-map`,
    );
    await context.confirmParked(fixture, started);
    await assertBoundary(
      `/v1/staff/tracking-sessions/${tracker.id}/route-history`,
      `/v1/staff/tracking-sessions/${randomUUID()}/route-history`,
    );
  });
});
