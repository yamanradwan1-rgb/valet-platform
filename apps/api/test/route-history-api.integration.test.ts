import { randomUUID } from "node:crypto";

import {
  MiddlewareConsumer,
  Module,
  type INestApplication,
  type NestModule,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RUNTIME_POSTGRES_POOL } from "../src/common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../src/common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../src/common/http/api-request";
import {
  FailClosedStaffPrincipalResolver,
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../src/modules/auth/staff-principal";
import { RouteHistoryController } from "../src/modules/tracking/route-history.controller";
import { RouteHistoryService } from "../src/modules/tracking/route-history.service";
import { RouteHistoryTestContext } from "./route-history-test-context";

const context = new RouteHistoryTestContext("api");
const principals = new Map<string, string>();
const resolver: StaffPrincipalResolver = {
  async resolve(authorization) {
    const userId = authorization && principals.get(authorization);
    return userId === undefined
      ? new FailClosedStaffPrincipalResolver().resolve(authorization)
      : { userId };
  },
};
let app: INestApplication;
let baseUrl: string;

@Module({
  controllers: [RouteHistoryController],
  imports: [HttpInfrastructureModule],
  providers: [
    RouteHistoryService,
    { provide: RUNTIME_POSTGRES_POOL, useFactory: () => context.runtimePool },
    { provide: STAFF_PRINCIPAL_RESOLVER, useValue: resolver },
  ],
})
class TestRouteHistoryModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes(RouteHistoryController);
  }
}

async function get(trackerId: string, query = "", token?: string) {
  const response = await fetch(
    `${baseUrl}/v1/staff/tracking-sessions/${trackerId}/route-history${query}`,
    { headers: token === undefined ? {} : { authorization: `Bearer ${token}` } },
  );
  return { body: await response.json(), status: response.status };
}

beforeAll(async () => {
  await context.setup();
  app = await NestFactory.create(TestRouteHistoryModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
}, 120_000);

afterAll(async () => {
  await app?.close();
  await context.teardown();
}, 120_000);

describe("VAL-007F route history API", () => {
  it("requires staff auth and exposes only the narrow ended-route contract", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const manager = await context.createActor(fixture, "LOCATION_MANAGER");
    await context.ingest(fixture, [await context.sample()]);
    await context.endTracker(fixture);
    expect((await get(fixture.trackingSessionId)).status).toBe(401);
    const token = randomUUID();
    principals.set(`Bearer ${token}`, manager.userId);
    const response = await get(fixture.trackingSessionId, "?limit=1", token);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ nextCursor: null, samples: [{
      capturedAt: expect.any(String), latitude: expect.any(Number), longitude: expect.any(Number),
    }] });
    expect(JSON.stringify(response.body)).not.toMatch(/clientSampleId|receivedAt|trackingSessionId|"id"/);
    expect((await get(fixture.trackingSessionId, "?cursor=broken", token)).status).toBe(400);
    expect((await get(fixture.trackingSessionId, "?limit=501", token)).status).toBe(400);
  });
});
