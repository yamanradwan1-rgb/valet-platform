import { randomUUID } from "node:crypto";

import {
  MiddlewareConsumer,
  Module,
  type INestApplication,
  type NestModule,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startParkingResponseSchema } from "@valet/contracts";

import { RUNTIME_POSTGRES_POOL } from "../src/common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../src/common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../src/common/http/api-request";
import {
  FailClosedStaffPrincipalResolver,
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../src/modules/auth/staff-principal";
import { StartParkingController } from "../src/modules/parking/start-parking.controller";
import { StartParkingService } from "../src/modules/parking/start-parking.service";
import { StartParkingTestContext } from "./start-parking-test-context";

const context = new StartParkingTestContext("api");
const principals = new Map<string, string>();
const principalResolver: StaffPrincipalResolver = {
  async resolve(authorization) {
    const userId =
      authorization === undefined ? undefined : principals.get(authorization);
    return userId === undefined
      ? new FailClosedStaffPrincipalResolver().resolve(authorization)
      : { userId };
  },
};

let app: INestApplication;
let baseUrl: string;

@Module({
  controllers: [StartParkingController],
  imports: [HttpInfrastructureModule],
  providers: [
    StartParkingService,
    { provide: RUNTIME_POSTGRES_POOL, useFactory: () => context.runtimePool },
    { provide: STAFF_PRINCIPAL_RESOLVER, useValue: principalResolver },
  ],
})
class TestStartParkingModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes(StartParkingController);
  }
}

async function request(
  path: string,
  options: {
    readonly body?: unknown;
    readonly method?: "PATCH" | "POST";
    readonly token?: string;
  } = {},
) {
  const headers: Record<string, string> = {};
  if (options.token !== undefined)
    headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "POST",
    headers,
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  return {
    body: (await response.json()) as Record<string, unknown>,
    requestId: response.headers.get("x-request-id"),
    status: response.status,
  };
}

beforeAll(async () => {
  await context.setup();
  app = await NestFactory.create(TestStartParkingModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
}, 120_000);

afterAll(async () => {
  await app?.close();
  await context.teardown();
}, 60_000);

describe("VAL-005F exact Start Parking API", () => {
  it("starts on the exact route with the minimal response", async () => {
    const fixture = await context.createStartParkingFixture();
    const token = `parking-${randomUUID()}`;
    principals.set(`Bearer ${token}`, fixture.userId);
    const result = await request(
      `/v1/staff/valet-sessions/${fixture.sessionId}/start-parking`,
      {
        body: { expectedSessionVersion: 2, expectedTaskVersion: 3 },
        token,
      },
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      parkingStartedAt: expect.any(String),
      sessionId: fixture.sessionId,
      sessionVersion: 3,
      state: "PARKING",
      taskId: fixture.taskId,
      taskStatus: "IN_PROGRESS",
      taskVersion: 4,
    });
    expect(result.requestId).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
    expect(result.body).not.toHaveProperty("keySlotId");
    expect(result.body).not.toHaveProperty("parkingZoneId");
  });

  it.each([
    ["missing session version", { expectedTaskVersion: 3 }],
    ["missing task version", { expectedSessionVersion: 2 }],
    [
      "unknown authority",
      {
        expectedSessionVersion: 2,
        expectedTaskVersion: 3,
        membershipId: randomUUID(),
      },
    ],
  ])("rejects %s through the strict shared contract", async (_name, body) => {
    const fixture = await context.createStartParkingFixture();
    const token = `parking-${randomUUID()}`;
    principals.set(`Bearer ${token}`, fixture.userId);
    const result = await request(
      `/v1/staff/valet-sessions/${fixture.sessionId}/start-parking`,
      { body, token },
    );
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("REQUEST_INVALID");
  });

  it("requires Staff Auth and starts an unbound session without key custody", async () => {
    const fixture = await context.createStartParkingFixture({
      assignKey: false,
    });
    const unauthenticated = await request(
      `/v1/staff/valet-sessions/${fixture.sessionId}/start-parking`,
      { body: { expectedSessionVersion: 1, expectedTaskVersion: 3 } },
    );
    expect(unauthenticated.status).toBe(401);
    const token = `parking-${randomUUID()}`;
    principals.set(`Bearer ${token}`, fixture.userId);
    const started = await request(
      `/v1/staff/valet-sessions/${fixture.sessionId}/start-parking`,
      {
        body: { expectedSessionVersion: 1, expectedTaskVersion: 3 },
        token,
      },
    );
    expect(started.status).toBe(200);
    expect(startParkingResponseSchema.parse(started.body)).toEqual({
      parkingStartedAt: expect.any(String),
      sessionId: fixture.sessionId,
      sessionVersion: 2,
      state: "PARKING",
      taskId: fixture.taskId,
      taskStatus: "IN_PROGRESS",
      taskVersion: 4,
    });
    expect(started.body).not.toHaveProperty("keySlotId");
    const projection = await context.adminPool.query<{
      key_slot_id: string | null;
    }>(
      `SELECT key_slot_id::text FROM valet_sessions WHERE id = $1`,
      [fixture.sessionId],
    );
    expect(projection.rows[0]?.key_slot_id).toBeNull();
    const custody = await context.adminPool.query<{ id: string }>(
      `SELECT id FROM key_custody_events WHERE valet_session_id = $1`,
      [fixture.sessionId],
    );
    expect(custody.rows).toEqual([]);
  });

  it("maps an unusable assigned slot to safe 409", async () => {
    const fixture = await context.createStartParkingFixture();
    await context.adminPool.query(
      `UPDATE key_slots SET status = 'INACTIVE' WHERE id = $1`,
      [fixture.keySlotId],
    );
    const token = `parking-${randomUUID()}`;
    principals.set(`Bearer ${token}`, fixture.userId);
    const conflict = await request(
      `/v1/staff/valet-sessions/${fixture.sessionId}/start-parking`,
      {
        body: { expectedSessionVersion: 2, expectedTaskVersion: 3 },
        token,
      },
    );
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("KEY_CUSTODY_NOT_READY");
    expect(JSON.stringify(conflict.body)).not.toMatch(
      /constraint|SELECT|key_slots/i,
    );
  });

  it("exposes no PATCH, Confirm Parked, GPS, or Retrieval shortcut", async () => {
    const fixture = await context.createStartParkingFixture();
    const token = `parking-${randomUUID()}`;
    principals.set(`Bearer ${token}`, fixture.userId);
    expect(
      (
        await request(
          `/v1/staff/valet-sessions/${fixture.sessionId}/start-parking`,
          { body: {}, method: "PATCH", token },
        )
      ).status,
    ).toBe(404);
    for (const path of [
      `/v1/staff/valet-sessions/${fixture.sessionId}/confirm-parked`,
      `/v1/staff/valet-sessions/${fixture.sessionId}/gps`,
      `/v1/staff/valet-sessions/${fixture.sessionId}/retrieve`,
    ]) {
      expect((await request(path, { body: {}, token })).status).toBe(404);
    }
  });
});
