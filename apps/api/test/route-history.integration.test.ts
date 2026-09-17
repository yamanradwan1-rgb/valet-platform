import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  expectRouteDenied,
  RouteHistoryTestContext,
} from "./route-history-test-context";

const context = new RouteHistoryTestContext("query");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

describe("VAL-007F ended route history", () => {
  it("allows an exact-location manager and paginates by captured_at/id", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const manager = await context.createActor(fixture, "LOCATION_MANAGER");
    const capturedAt = (await context.databaseTime()).toISOString();
    const samples = await Promise.all([
      context.sample({ capturedAt, latitude: 31.1 }),
      context.sample({ capturedAt, latitude: 31.2 }),
      context.sample({ capturedAt: new Date(Date.parse(capturedAt) + 1).toISOString(), latitude: 31.3 }),
    ]);
    await context.ingest(fixture, samples);
    await context.endTracker(fixture);

    const first = await context.query({
      authenticatedUserId: manager.userId,
      limit: 2,
      trackingSessionId: fixture.trackingSessionId,
    });
    expect(first.samples).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await context.query({
      authenticatedUserId: manager.userId,
      cursor: first.nextCursor!,
      limit: 2,
      trackingSessionId: fixture.trackingSessionId,
    });
    expect(second.samples).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect([...first.samples, ...second.samples].map((sample) => sample.latitude)).toEqual(
      (await context.rawSamples(fixture)).map((sample) => Number(sample.latitude)),
    );
    expect(JSON.stringify(first)).not.toMatch(/clientSampleId|receivedAt|"id"/);
  });

  it("requires exact authorization and an ended tracker", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const manager = await context.createActor(fixture, "LOCATION_MANAGER");
    const noAccess = await context.createActor(fixture, "LOCATION_MANAGER", { access: false });
    const supervisor = await context.createActor(fixture, "VALET_SUPERVISOR", { activeShift: true });
    const unshifted = await context.createActor(fixture, "VALET_SUPERVISOR");
    const otherLocationId = await context.createLocation(fixture);
    const wrongShift = await context.createActor(fixture, "VALET_SUPERVISOR", {
      activeShift: true,
      locationId: otherLocationId,
    });
    const employee = await context.createActor(fixture, "VALET_EMPLOYEE");
    const admin = await context.createActor(fixture, "ORG_ADMIN");

    await expectRouteDenied(context.query({ authenticatedUserId: manager.userId, trackingSessionId: fixture.trackingSessionId }));
    await context.endTracker(fixture);
    expect((await context.query({ authenticatedUserId: supervisor.userId, trackingSessionId: fixture.trackingSessionId })).samples).toEqual([]);
    for (const userId of [
      noAccess.userId,
      unshifted.userId,
      wrongShift.userId,
      employee.userId,
      admin.userId,
      randomUUID(),
    ]) {
      await expectRouteDenied(context.query({ authenticatedUserId: userId, trackingSessionId: fixture.trackingSessionId }));
    }
    await expectRouteDenied(context.query({ authenticatedUserId: manager.userId, trackingSessionId: randomUUID() }));
  });

  it("never returns samples from another tracker", async () => {
    const target = await context.createParkingTrackingFixture();
    const foreign = await context.createParkingTrackingFixture();
    const manager = await context.createActor(target, "LOCATION_MANAGER");
    await context.ingest(target, [await context.sample({ latitude: 30 })]);
    await context.ingest(foreign, [await context.sample({ latitude: 40 })]);
    await context.endTracker(target);
    await context.endTracker(foreign);
    const route = await context.query({ authenticatedUserId: manager.userId, trackingSessionId: target.trackingSessionId });
    expect(route.samples.map((sample) => sample.latitude)).toEqual([30]);
    await expectRouteDenied(context.query({ authenticatedUserId: manager.userId, trackingSessionId: foreign.trackingSessionId }));
  });

  it("re-checks persisted user, membership, Organization, and Location status", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const inactiveMembership = await context.createActor(fixture, "LOCATION_MANAGER");
    const inactiveUser = await context.createActor(fixture, "LOCATION_MANAGER");
    const manager = await context.createActor(fixture, "LOCATION_MANAGER");
    await context.endTracker(fixture);
    await context.adminPool.query(
      `UPDATE organization_memberships SET status = 'INACTIVE' WHERE id = $1`,
      [inactiveMembership.membershipId],
    );
    await context.adminPool.query(
      `UPDATE users SET status = 'DISABLED' WHERE id = $1`,
      [inactiveUser.userId],
    );
    await expectRouteDenied(context.query({ authenticatedUserId: inactiveMembership.userId, trackingSessionId: fixture.trackingSessionId }));
    await expectRouteDenied(context.query({ authenticatedUserId: inactiveUser.userId, trackingSessionId: fixture.trackingSessionId }));
    await context.adminPool.query(
      `UPDATE locations SET status = 'INACTIVE', accepting_intake = FALSE WHERE id = $1`,
      [fixture.locationId],
    );
    await expectRouteDenied(context.query({ authenticatedUserId: manager.userId, trackingSessionId: fixture.trackingSessionId }));
    await context.adminPool.query(`UPDATE locations SET status = 'ACTIVE' WHERE id = $1`, [fixture.locationId]);
    await context.adminPool.query(`UPDATE organizations SET status = 'INACTIVE' WHERE id = $1`, [fixture.organizationId]);
    await expectRouteDenied(context.query({ authenticatedUserId: manager.userId, trackingSessionId: fixture.trackingSessionId }));
  });
});
