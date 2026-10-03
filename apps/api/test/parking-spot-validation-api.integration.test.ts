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
import { ParkingSpotValidationController } from "../src/modules/parking/parking-spot-validation.controller";
import { ParkingSpotValidationService } from "../src/modules/parking/parking-spot-validation.service";
import { ConfirmParkedTestContext } from "./confirm-parked-test-context";

import { validationInput } from "./parking-spot-validation-test-support";

const context = new ConfirmParkedTestContext("264_http");
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
  controllers: [ParkingSpotValidationController],
  imports: [HttpInfrastructureModule],
  providers: [
    ParkingSpotValidationService,
    { provide: RUNTIME_POSTGRES_POOL, useFactory: () => context.runtimePool },
    { provide: STAFF_PRINCIPAL_RESOLVER, useValue: principalResolver },
  ],
})
class TestParkingSpotValidationModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(ParkingSpotValidationController);
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
    method: options.method ?? "GET",
    headers,
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  return {
    body: (await response.json()) as Record<string, unknown>,
    requestId: response.headers.get("x-request-id"),
    cache: response.headers.get("cache-control"),
    status: response.status,
  };
}

beforeAll(async () => {
  await context.setup();
  app = await NestFactory.create(TestParkingSpotValidationModule, {
    logger: false,
  });
  await app.listen(0, "127.0.0.1");
  baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
}, 120_000);

afterAll(async () => {
  await app?.close();
  await context.teardown();
}, 60_000);

async function target() {
  const f = await context.createConfirmParkedFixture();
  const { authenticatedUserId, sessionId, ...input } = await validationInput(
    context,
    f,
  );
  const token = randomUUID();
  principals.set(`Bearer ${token}`, authenticatedUserId);
  const path = `/v1/staff/valet-sessions/${sessionId}/parking-spot-validation`;
  return { f, input, token, path };
}

const query = (input: object) =>
  new URLSearchParams(
    Object.entries(input).map(([key, value]): [string, string] => [
      key,
      String(value),
    ]),
  ).toString();

describe("#264 exact read-only staff HTTP surface", () => {
  it("returns strict affirmative current proof with no-store", async () => {
    const { f, input, token, path } = await target();
    const result = await request(`${path}?${query(input)}`, { token });
    expect(result.status).toBe(200);
    expect(result.cache).toBe("no-store");
    expect(result.requestId).toBeTruthy();
    expect(result.body).toEqual({
      sessionId: f.sessionId,
      taskId: f.taskId,
      sessionVersion: 3,
      taskVersion: 4,
      parkingSpotId: f.parkingSpotId,
      parkingSpotCode: f.parkingSpotCode,
      parkingZoneId: f.parkingZoneId,
      available: true,
    });
  });

  it.each([
    { organizationId: randomUUID() },
    { locationId: randomUUID() },
    { role: "ORG_ADMIN" },
    { taskId: "invalid" },
    { expectedShiftId: "invalid" },
    { parkingSpotId: "invalid" },
    { expectedSessionVersion: 0 },
    { expectedTaskVersion: -1 },
    { parkingSpotCode: " " },
  ])("strictly rejects invalid query %j", async (invalid) => {
    const { input, token, path } = await target();
    const result = await request(`${path}?${query({ ...input, ...invalid })}`, {
      token,
    });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("REQUEST_INVALID");
  });

  it("rejects repeated fields, invalid route UUID, and absent principal", async () => {
    const { f, input, token, path } = await target();
    expect(
      (
        await request(`${path}?${query(input)}&taskId=${input.taskId}`, {
          token,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          `${path.replace(f.sessionId, "invalid")}?${query(input)}`,
          { token },
        )
      ).status,
    ).toBe(400);
    expect((await request(`${path}?${query(input)}`)).status).toBe(401);
    expect(
      (await request(`${path}?${query(input)}`, { token: "invalid" })).status,
    ).toBe(401);
  });

  it("maps resource, version and unauthorized errors without disclosure", async () => {
    const { input, token, path } = await target();
    for (const [override, code, status] of [
      [
        { parkingSpotCode: randomUUID() },
        "PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE",
        409,
      ],
      [{ expectedSessionVersion: 2 }, "VERSION_CONFLICT", 409],
      [{ taskId: randomUUID() }, "TASK_NOT_FOUND_OR_FORBIDDEN", 404],
    ] as const) {
      const result = await request(
        `${path}?${query({ ...input, ...override })}`,
        { token },
      );
      expect(result.status).toBe(status);
      expect(result.body.code).toBe(code);
      expect(JSON.stringify(result.body)).not.toMatch(
        /SELECT|constraint|parking_spots/,
      );
    }
    expect(
      (await request(`${path}?${query(input)}`, { token, method: "POST" }))
        .status,
    ).toBe(404);
  });
});
