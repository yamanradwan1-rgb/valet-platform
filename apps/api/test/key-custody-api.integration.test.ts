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
import { KeyCustodyController } from "../src/modules/keys/key-custody.controller";
import { KeyCustodyService } from "../src/modules/keys/key-custody.service";
import { KeyTestContext } from "./key-test-context";

const context = new KeyTestContext("http");
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
  controllers: [KeyCustodyController],
  imports: [HttpInfrastructureModule],
  providers: [
    KeyCustodyService,
    { provide: RUNTIME_POSTGRES_POOL, useFactory: () => context.runtimePool },
    { provide: STAFF_PRINCIPAL_RESOLVER, useValue: principalResolver },
  ],
})
class TestKeyCustodyModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes(KeyCustodyController);
  }
}

async function request(
  path: string,
  options: { readonly body?: unknown; readonly token?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (options.token !== undefined)
    headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
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
  const fixture = await context.createKeyFixture();
  const token = `key-${randomUUID()}`;
  principals.set(`Bearer ${token}`, fixture.userId);
  return { fixture, token };
}

beforeAll(async () => {
  await context.setup();
  app = await NestFactory.create(TestKeyCustodyModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
}, 120_000);

beforeEach(() => principals.clear());

afterAll(async () => {
  await app?.close();
  await context.teardown();
}, 60_000);

describe("VAL-005C Key custody HTTP surface", () => {
  it("assigns and clears through the strict staff routes", async () => {
    const { fixture, token } = await fixtureWithToken();
    const assigned = await request(
      `/v1/staff/valet-sessions/${fixture.sessionId}/key-slot/assign`,
      {
        body: { expectedVersion: 1, keySlotCode: ` ${fixture.slotCode} ` },
        token,
      },
    );
    expect(assigned.status).toBe(200);
    expect(assigned.body).toEqual({
      keySlotCode: fixture.slotCode,
      sessionId: fixture.sessionId,
      state: "AWAITING_PARKING",
      version: 2,
    });
    expect(assigned.requestId).toMatch(/^[A-Za-z0-9._-]{1,128}$/);

    const cleared = await request(
      `/v1/staff/valet-sessions/${fixture.sessionId}/key-slot/clear`,
      { body: { expectedVersion: 2 }, token },
    );
    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({ keySlotCode: null, version: 3 });
  });

  it("rejects client authority and non-empty clear fields", async () => {
    const { fixture, token } = await fixtureWithToken();
    const assign = await request(
      `/v1/staff/valet-sessions/${fixture.sessionId}/key-slot/assign`,
      {
        body: {
          expectedVersion: 1,
          keySlotCode: fixture.slotCode,
          membershipId: fixture.membershipId,
        },
        token,
      },
    );
    expect(assign.status).toBe(400);
    expect(assign.body.code).toBe("REQUEST_INVALID");
    const clear = await request(
      `/v1/staff/valet-sessions/${fixture.sessionId}/key-slot/clear`,
      { body: { expectedVersion: 1, keySlotId: fixture.slotId }, token },
    );
    expect(clear.status).toBe(400);
  });

  it("maps unavailable occupancy to safe HTTP 409 without database details", async () => {
    const { fixture, token } = await fixtureWithToken();
    await context.addSession(fixture, { keySlotId: fixture.slotId });
    const result = await request(
      `/v1/staff/valet-sessions/${fixture.sessionId}/key-slot/assign`,
      { body: { expectedVersion: 1, keySlotCode: fixture.slotCode }, token },
    );
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("KEY_SLOT_NOT_FOUND_OR_UNAVAILABLE");
    expect(JSON.stringify(result.body)).not.toContain(
      "valet_sessions_key_slot_id_key",
    );
  });

  it("requires Staff Auth and exposes no checkout or return route", async () => {
    const { fixture, token } = await fixtureWithToken();
    const unauthenticated = await request(
      `/v1/staff/valet-sessions/${fixture.sessionId}/key-slot/assign`,
      { body: { expectedVersion: 1, keySlotCode: fixture.slotCode } },
    );
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.code).toBe("STAFF_AUTHENTICATION_REQUIRED");

    for (const action of ["checkout", "return"]) {
      const result = await request(
        `/v1/staff/valet-sessions/${fixture.sessionId}/key-slot/${action}`,
        { body: {}, token },
      );
      expect(result.status).toBe(404);
    }
  });
});
