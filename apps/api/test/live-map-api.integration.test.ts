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
import { LiveMapController } from "../src/modules/tracking/live-map.controller";
import { LiveMapService } from "../src/modules/tracking/live-map.service";
import { LiveMapTestContext } from "./live-map-test-context";

const context = new LiveMapTestContext("api");
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
  controllers: [LiveMapController],
  imports: [HttpInfrastructureModule],
  providers: [
    LiveMapService,
    { provide: RUNTIME_POSTGRES_POOL, useFactory: () => context.runtimePool },
    { provide: STAFF_PRINCIPAL_RESOLVER, useValue: resolver },
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
});
