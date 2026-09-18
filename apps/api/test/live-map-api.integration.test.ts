import { randomUUID } from "node:crypto";

import {
  MiddlewareConsumer,
  Module,
  type INestApplication,
  type NestModule,
  UnauthorizedException,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RUNTIME_POSTGRES_POOL } from "../src/common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../src/common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../src/common/http/api-request";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContextResolver,
} from "../src/modules/auth/staff-session-context";
import { LiveMapController } from "../src/modules/tracking/live-map.controller";
import { LiveMapService } from "../src/modules/tracking/live-map.service";
import { LiveMapTestContext } from "./live-map-test-context";

const context = new LiveMapTestContext("api");
const principals = new Map<string, string>();
const resolver: StaffSessionContextResolver = {
  async resolve(authorization) {
    const userId = authorization && principals.get(authorization);
    if (userId === undefined) throw new UnauthorizedException();
    return {
      accessTokenHash: "test-access-hash",
      createdAt: new Date(0),
      staffAuthSessionId: randomUUID(),
      userId,
    };
  },
};
let app: INestApplication;
let baseUrl: string;

@Module({
  controllers: [LiveMapController],
  imports: [HttpInfrastructureModule],
  providers: [
    LiveMapService,
    { provide: RUNTIME_POSTGRES_POOL, useFactory: () => context.runtimePool },
    { provide: STAFF_SESSION_CONTEXT_RESOLVER, useValue: resolver },
  ],
})
class TestLiveMapModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes(LiveMapController);
  }
}

async function get(locationId: string, query = "", token?: string) {
  const response = await fetch(
    `${baseUrl}/v1/staff/locations/${locationId}/live-operations-map${query}`,
    {
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    },
  );
  return { body: await response.json(), status: response.status };
}

async function enableDashboardAccess(organizationId: string) {
  await context.adminPool.query(
    `UPDATE organization_subscriptions
     SET dashboard_access_enabled=TRUE, updated_at=clock_timestamp()
     WHERE organization_id=$1`,
    [organizationId],
  );
}

beforeAll(async () => {
  await context.setup();
  app = await NestFactory.create(TestLiveMapModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
}, 120_000);

afterAll(async () => {
  await app?.close();
  await context.teardown();
}, 120_000);

describe("VAL-007G live operations map API", () => {
  it("requires one staff bearer and returns only the strict response", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await enableDashboardAccess(fixture.organizationId);
    const manager = await context.manager(fixture);
    expect((await get(fixture.locationId)).status).toBe(401);
    const token = randomUUID();
    principals.set(`Bearer ${token}`, manager.userId);
    const response = await get(fixture.locationId, "?limit=1", token);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      items: [{ position: null, taskType: "PARKING" }],
      nextCursor: null,
      observedAt: expect.any(String),
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /organizationId|locationId|userId|shiftId|vertices/,
    );
  });

  it("rejects malformed location, cursor, limit, and unknown query fields", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await enableDashboardAccess(fixture.organizationId);
    const manager = await context.manager(fixture);
    const token = randomUUID();
    principals.set(`Bearer ${token}`, manager.userId);
    for (const [locationId, query] of [
      ["not-a-uuid", ""],
      [fixture.locationId, "?cursor=broken"],
      [fixture.locationId, "?limit=501"],
      [fixture.locationId, "?taskId=hidden"],
    ] as const) {
      expect((await get(locationId, query, token)).status).toBe(400);
    }
  });

  it("uses one non-disclosing response for unavailable Location authority", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await enableDashboardAccess(fixture.organizationId);
    const manager = await context.manager(fixture);
    const token = randomUUID();
    principals.set(`Bearer ${token}`, manager.userId);
    const response = await get(randomUUID(), "", token);
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      code: "AUTHORIZATION_DENIED",
      message: "The requested resource is not available.",
    });
  });

  it("denies a Supervisor shifted only at another Location without disclosure", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await enableDashboardAccess(fixture.organizationId);
    const otherLocationId = await context.createLocation(fixture);
    const supervisor = await context.createActor(fixture, "VALET_SUPERVISOR", {
      activeShift: true,
      locationId: otherLocationId,
    });
    await context.adminPool.query(
      `INSERT INTO membership_location_access
         (organization_id, membership_id, location_id)
       VALUES ($1, $2, $3)`,
      [fixture.organizationId, supervisor.membershipId, fixture.locationId],
    );
    const token = randomUUID();
    principals.set(`Bearer ${token}`, supervisor.userId);

    const response = await get(fixture.locationId, "", token);
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      code: "AUTHORIZATION_DENIED",
      message: "The requested resource is not available.",
    });
  });

  it("reauthorizes a Supervisor Shift on the next cursor page", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await enableDashboardAccess(fixture.organizationId);
    const supervisor = await context.supervisor(fixture);
    const startedAt = new Date(fixture.trackerStartedAt.getTime() + 1_000);
    await context.addParkingWork(fixture, startedAt);
    await context.addParkingWork(fixture, startedAt);
    const token = randomUUID();
    principals.set(`Bearer ${token}`, supervisor.userId);

    const first = await get(fixture.locationId, "?limit=1", token);
    expect(first.status).toBe(200);
    const nextCursor = (first.body as { nextCursor?: unknown }).nextCursor;
    expect(typeof nextCursor).toBe("string");
    await context.adminPool.query(
      `UPDATE shifts SET status = 'ENDED', ended_at = transaction_timestamp()
       WHERE membership_id = $1 AND location_id = $2 AND status = 'ACTIVE'`,
      [supervisor.membershipId, fixture.locationId],
    );

    const second = await get(
      fixture.locationId,
      `?limit=1&cursor=${encodeURIComponent(nextCursor as string)}`,
      token,
    );
    expect(second.status).toBe(404);
    expect(second.body).toMatchObject({
      code: "AUTHORIZATION_DENIED",
      message: "The requested resource is not available.",
    });
  });
});
