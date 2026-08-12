import { randomUUID } from "node:crypto";

import {
  MiddlewareConsumer,
  Module,
  type INestApplication,
  type NestModule,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { RUNTIME_POSTGRES_POOL } from "../src/common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../src/common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../src/common/http/api-request";
import {
  FailClosedStaffPrincipalResolver,
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../src/modules/auth/staff-principal";
import { ShiftController } from "../src/modules/shifts/shift.controller";
import { ShiftService } from "../src/modules/shifts/shift.service";
import { ShiftTestContext } from "./shift-test-context";

interface HttpResult {
  readonly body: Record<string, unknown>;
  readonly requestId: string | null;
  readonly status: number;
}

const context = new ShiftTestContext("http");
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
  controllers: [ShiftController],
  imports: [HttpInfrastructureModule],
  providers: [
    ShiftService,
    { provide: RUNTIME_POSTGRES_POOL, useFactory: () => context.runtimePool },
    { provide: STAFF_PRINCIPAL_RESOLVER, useValue: principalResolver },
  ],
})
class TestShiftModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes(ShiftController);
  }
}

async function request(
  method: string,
  path: string,
  options: { readonly body?: unknown; readonly token?: string } = {},
): Promise<HttpResult> {
  const headers: Record<string, string> = {};
  if (options.token !== undefined)
    headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method,
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

async function fixtureWithToken() {
  const fixture = await context.createFixture();
  const token = `shift-${randomUUID()}`;
  principals.set(`Bearer ${token}`, fixture.userId);
  return { fixture, token };
}

beforeAll(async () => {
  await context.setup();
  app = await NestFactory.create(TestShiftModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
}, 120_000);

beforeEach(() => principals.clear());

afterAll(async () => {
  await app?.close();
  await context.teardown();
}, 60_000);

describe("VAL-005B Shift HTTP surface", () => {
  it("starts, looks up, and ends the authenticated User's Shift", async () => {
    const { fixture, token } = await fixtureWithToken();
    const started = await request("POST", "/v1/staff/shifts/start", {
      body: { targetLocationId: fixture.locationId },
      token,
    });
    expect(started.status).toBe(200);
    expect(started.body).toMatchObject({
      endedAt: null,
      locationId: fixture.locationId,
      status: "ACTIVE",
    });
    expect(started.requestId).toMatch(/^[A-Za-z0-9._-]{1,128}$/);

    const active = await request(
      "GET",
      `/v1/staff/shifts/active?locationId=${fixture.locationId}`,
      { token },
    );
    expect(active.status).toBe(200);
    expect(active.body.shift).toEqual(started.body);

    const ended = await request(
      "POST",
      `/v1/staff/shifts/${String(started.body.shiftId)}/end`,
      { body: {}, token },
    );
    expect(ended.status).toBe(200);
    expect(ended.body).toMatchObject({ status: "ENDED" });
    expect(ended.body.endedAt).toEqual(expect.any(String));
  });

  it("maps a different-Location active Shift to HTTP 409", async () => {
    const { fixture, token } = await fixtureWithToken();
    const secondLocationId = await context.addLocation(fixture);
    await request("POST", "/v1/staff/shifts/start", {
      body: { targetLocationId: fixture.locationId },
      token,
    });
    const conflict = await request("POST", "/v1/staff/shifts/start", {
      body: { targetLocationId: secondLocationId },
      token,
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("ACTIVE_SHIFT_CONFLICT");
    expect(conflict.body.requestId).toBe(conflict.requestId);
  });

  it.each([
    [
      "start authority field",
      "POST",
      "/v1/staff/shifts/start",
      { targetLocationId: randomUUID(), userId: randomUUID() },
    ],
    [
      "non-empty end body",
      "POST",
      `/v1/staff/shifts/${randomUUID()}/end`,
      { override: true },
    ],
  ])(
    "rejects %s through strict shared contracts",
    async (_name, method, path, body) => {
      const { token } = await fixtureWithToken();
      const result = await request(method, path, { body, token });
      expect(result.status).toBe(400);
      expect(result.body.code).toBe("REQUEST_INVALID");
    },
  );

  it("rejects unknown query authority and missing staff authentication", async () => {
    const { fixture, token } = await fixtureWithToken();
    const invalid = await request(
      "GET",
      `/v1/staff/shifts/active?locationId=${fixture.locationId}&membershipId=${fixture.membershipId}`,
      { token },
    );
    expect(invalid.status).toBe(400);
    const unauthenticated = await request(
      "GET",
      `/v1/staff/shifts/active?locationId=${fixture.locationId}`,
    );
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.code).toBe("STAFF_AUTHENTICATION_REQUIRED");
  });

  it("conceals foreign self-end over HTTP", async () => {
    const owner = await fixtureWithToken();
    const other = await fixtureWithToken();
    const started = await request("POST", "/v1/staff/shifts/start", {
      body: { targetLocationId: owner.fixture.locationId },
      token: owner.token,
    });
    const result = await request(
      "POST",
      `/v1/staff/shifts/${String(started.body.shiftId)}/end`,
      { body: {}, token: other.token },
    );
    expect(result.status).toBe(404);
    expect(result.body.code).toBe("TENANT_ACCESS_DENIED");
  });
});
