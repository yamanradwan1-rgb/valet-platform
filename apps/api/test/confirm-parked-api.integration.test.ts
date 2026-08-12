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
import { ConfirmParkedController } from "../src/modules/parking/confirm-parked.controller";
import { ConfirmParkedService } from "../src/modules/parking/confirm-parked.service";
import { ConfirmParkedTestContext } from "./confirm-parked-test-context";

const context = new ConfirmParkedTestContext("api");
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
  controllers: [ConfirmParkedController],
  imports: [HttpInfrastructureModule],
  providers: [
    ConfirmParkedService,
    { provide: RUNTIME_POSTGRES_POOL, useFactory: () => context.runtimePool },
    { provide: STAFF_PRINCIPAL_RESOLVER, useValue: principalResolver },
  ],
})
class TestConfirmParkedModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes(ConfirmParkedController);
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
  app = await NestFactory.create(TestConfirmParkedModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
}, 120_000);

afterAll(async () => {
  await app?.close();
  await context.teardown();
}, 60_000);

describe("VAL-005G exact Confirm Parked API", () => {
  it("confirms on the exact route with a minimal response", async () => {
    const fixture = await context.createConfirmParkedFixture();
    const token = `confirm-${randomUUID()}`;
    principals.set(`Bearer ${token}`, fixture.userId);
    const result = await request(
      `/v1/staff/valet-sessions/${fixture.sessionId}/confirm-parked`,
      {
        body: {
          expectedSessionVersion: 3,
          expectedTaskVersion: 4,
          parkingSpotCode: fixture.parkingSpotCode,
        },
        token,
      },
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      parkedAt: expect.any(String),
      parkingSpotCode: fixture.parkingSpotCode,
      parkingSpotId: fixture.parkingSpotId,
      parkingZoneId: fixture.parkingZoneId,
      sessionId: fixture.sessionId,
      sessionVersion: 4,
      state: "PARKED",
      taskId: fixture.taskId,
      taskStatus: "COMPLETED",
      taskVersion: 5,
    });
    expect(result.body).not.toHaveProperty("keySlotCode");
    expect(result.body).not.toHaveProperty("retrievalRequestedAt");
  });

  it.each([
    ["session version", { expectedTaskVersion: 4, parkingSpotCode: "A-1" }],
    ["task version", { expectedSessionVersion: 3, parkingSpotCode: "A-1" }],
    ["Spot code", { expectedSessionVersion: 3, expectedTaskVersion: 4 }],
    [
      "unknown Zone authority",
      {
        expectedSessionVersion: 3,
        expectedTaskVersion: 4,
        parkingSpotCode: "A-1",
        parkingZoneId: randomUUID(),
      },
    ],
  ])(
    "rejects missing/unknown %s through strict contracts",
    async (_name, body) => {
      const fixture = await context.createConfirmParkedFixture();
      const token = `confirm-${randomUUID()}`;
      principals.set(`Bearer ${token}`, fixture.userId);
      const result = await request(
        `/v1/staff/valet-sessions/${fixture.sessionId}/confirm-parked`,
        { body, token },
      );
      expect(result.status).toBe(400);
      expect(result.body.code).toBe("REQUEST_INVALID");
    },
  );

  it("maps unavailable Spot safely and exposes no PATCH or Retrieval shortcut", async () => {
    const fixture = await context.createConfirmParkedFixture();
    const token = `confirm-${randomUUID()}`;
    principals.set(`Bearer ${token}`, fixture.userId);
    const conflict = await request(
      `/v1/staff/valet-sessions/${fixture.sessionId}/confirm-parked`,
      {
        body: {
          expectedSessionVersion: 3,
          expectedTaskVersion: 4,
          parkingSpotCode: randomUUID(),
        },
        token,
      },
    );
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE");
    expect(JSON.stringify(conflict.body)).not.toMatch(
      /constraint|SELECT|parking_spots/i,
    );
    expect(
      (
        await request(
          `/v1/staff/valet-sessions/${fixture.sessionId}/confirm-parked`,
          { body: {}, method: "PATCH", token },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `/v1/staff/valet-sessions/${fixture.sessionId}/retrieve`,
          { body: {}, token },
        )
      ).status,
    ).toBe(404);
  });
});
