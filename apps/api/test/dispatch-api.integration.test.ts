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
import { DispatchController } from "../src/modules/dispatch/dispatch.controller";
import { DispatchService } from "../src/modules/dispatch/dispatch.service";
import { DispatchTestContext } from "./dispatch-test-context";

const context = new DispatchTestContext("http");
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
  controllers: [DispatchController],
  imports: [HttpInfrastructureModule],
  providers: [
    DispatchService,
    { provide: RUNTIME_POSTGRES_POOL, useFactory: () => context.runtimePool },
    { provide: STAFF_PRINCIPAL_RESOLVER, useValue: principalResolver },
  ],
})
class TestDispatchModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes(DispatchController);
  }
}

async function request(
  method: string,
  path: string,
  options: { readonly body?: unknown; readonly token?: string } = {},
) {
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

async function fixtureWithToken(
  role: "VALET_EMPLOYEE" | "VALET_SUPERVISOR" = "VALET_EMPLOYEE",
) {
  const fixture = await context.createDispatchFixture({ role });
  const token = `dispatch-${randomUUID()}`;
  principals.set(`Bearer ${token}`, fixture.userId);
  return { fixture, token };
}

beforeAll(async () => {
  await context.setup();
  app = await NestFactory.create(TestDispatchModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
}, 120_000);

beforeEach(() => principals.clear());
afterAll(async () => {
  await app?.close();
  await context.teardown();
}, 60_000);

describe("VAL-005E exact Hybrid Dispatch HTTP surface", () => {
  it("queues, reads, assigns, accepts, declines, and reassigns on exact routes", async () => {
    const supervisor = await fixtureWithToken("VALET_SUPERVISOR");
    const target = await context.addMember(supervisor.fixture);
    const queued = await request(
      "POST",
      `/v1/staff/valet-sessions/${supervisor.fixture.sessionId}/parking-task/queue`,
      { body: {}, token: supervisor.token },
    );
    expect(queued.status).toBe(200);
    expect(queued.body).toMatchObject({ status: "QUEUED", version: 1 });
    const read = await request(
      "GET",
      `/v1/staff/tasks/queue?locationId=${supervisor.fixture.locationId}`,
      { token: supervisor.token },
    );
    expect(read.body).toMatchObject({
      tasks: [
        {
          ...queued.body,
          parkingSpot: null,
          parkingZone: null,
          retrievalRequestedAt: null,
          vehicle: {
            color: null,
            make: null,
            model: null,
            plateNumberRaw: null,
            temporaryDescriptor: expect.stringMatching(/^Dispatch /),
          },
        },
      ],
    });

    const assigned = await request(
      "POST",
      `/v1/staff/tasks/${String(queued.body.taskId)}/assign`,
      {
        body: {
          expectedVersion: 1,
          targetAssigneeMembershipId: target.membershipId,
        },
        token: supervisor.token,
      },
    );
    expect(assigned.body).toMatchObject({ status: "ASSIGNED", version: 2 });
    const targetToken = `target-${randomUUID()}`;
    principals.set(`Bearer ${targetToken}`, target.userId);
    const accepted = await request(
      "POST",
      `/v1/staff/tasks/${String(queued.body.taskId)}/accept`,
      { body: { expectedVersion: 2 }, token: targetToken },
    );
    expect(accepted.body).toMatchObject({ status: "ACCEPTED", version: 3 });
    const reassigned = await request(
      "POST",
      `/v1/staff/tasks/${String(queued.body.taskId)}/reassign`,
      {
        body: {
          expectedVersion: 3,
          reason: "handoff",
          targetAssigneeMembershipId: supervisor.fixture.membershipId,
        },
        token: supervisor.token,
      },
    );
    expect(reassigned.body).toMatchObject({ status: "ACCEPTED", version: 4 });

    const secondSession = await context.addSession(supervisor.fixture);
    const second = await request(
      "POST",
      `/v1/staff/valet-sessions/${secondSession}/parking-task/queue`,
      { body: {}, token: supervisor.token },
    );
    await request(
      "POST",
      `/v1/staff/tasks/${String(second.body.taskId)}/assign`,
      {
        body: { expectedVersion: 1 },
        token: supervisor.token,
      },
    );
    const declined = await request(
      "POST",
      `/v1/staff/tasks/${String(second.body.taskId)}/decline`,
      { body: { expectedVersion: 2, reason: " " }, token: supervisor.token },
    );
    expect(declined.body).toMatchObject({ status: "QUEUED", version: 3 });
  });

  it("enforces strict contracts, authentication, concealment, and safe errors", async () => {
    const actor = await fixtureWithToken();
    const invalid = await request(
      "POST",
      `/v1/staff/valet-sessions/${actor.fixture.sessionId}/parking-task/queue`,
      {
        body: { organizationId: actor.fixture.organizationId },
        token: actor.token,
      },
    );
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe("REQUEST_INVALID");
    const unauthenticated = await request(
      "GET",
      `/v1/staff/tasks/queue?locationId=${actor.fixture.locationId}`,
    );
    expect(unauthenticated.status).toBe(401);
    const missing = await request(
      "POST",
      `/v1/staff/tasks/${randomUUID()}/assign`,
      { body: { expectedVersion: 1 }, token: actor.token },
    );
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("TASK_NOT_FOUND_OR_FORBIDDEN");
    expect(JSON.stringify(missing.body)).not.toMatch(
      /constraint|SELECT|tasks_/i,
    );
  });

  it("exposes no generic PATCH, Retrieval, GPS, or physical parking route", async () => {
    const actor = await fixtureWithToken();
    for (const [method, path] of [
      ["PATCH", `/v1/staff/tasks/${randomUUID()}`],
      ["POST", `/v1/staff/tasks/${randomUUID()}/start-parking`],
      ["POST", `/v1/staff/retrieval/tasks/queue`],
      ["POST", `/v1/staff/tasks/${randomUUID()}/gps`],
    ] as const) {
      expect(
        (await request(method, path, { body: {}, token: actor.token })).status,
      ).toBe(404);
    }
  });
});
