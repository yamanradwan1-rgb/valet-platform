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
import { MarkReadyController } from "../src/modules/retrieval/mark-ready.controller";
import { MarkReadyService } from "../src/modules/retrieval/mark-ready.service";
import { MarkReadyTestContext } from "./mark-ready-test-context";

const context = new MarkReadyTestContext("api");
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
  controllers: [MarkReadyController],
  imports: [HttpInfrastructureModule],
  providers: [
    MarkReadyService,
    { provide: RUNTIME_POSTGRES_POOL, useFactory: () => context.runtimePool },
    { provide: STAFF_PRINCIPAL_RESOLVER, useValue: principalResolver },
  ],
})
class MarkReadyTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes(MarkReadyController);
  }
}

async function post(sessionId: string, body: unknown, token?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  const response = await fetch(
    `${baseUrl}/v1/staff/valet-sessions/${sessionId}/mark-ready`,
    { body: JSON.stringify(body), headers, method: "POST" },
  );
  return {
    body: (await response.json()) as Record<string, unknown>,
    requestId: response.headers.get("x-request-id"),
    status: response.status,
  };
}

beforeAll(async () => {
  await context.setup();
  app = await NestFactory.create(MarkReadyTestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  baseUrl = await app.getUrl();
}, 120_000);

afterAll(async () => {
  await app?.close();
  await context.teardown();
}, 60_000);

describe("VAL-006E Mark Ready API", () => {
  it("marks ready on the canonical route with a minimal response", async () => {
    const fixture = await context.createMarkReadyFixture();
    const token = `ready-${randomUUID()}`;
    principals.set(`Bearer ${token}`, fixture.userId);
    const result = await post(
      fixture.sessionId,
      { expectedSessionVersion: 6 },
      token,
    );
    expect(result).toMatchObject({
      body: {
        readyAt: expect.any(String),
        sessionId: fixture.sessionId,
        sessionVersion: 7,
        state: "READY",
        taskId: fixture.retrievalTaskId,
        taskStatus: "IN_PROGRESS",
        taskVersion: 4,
      },
      status: 200,
    });
    expect(result.requestId).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
    expect(result.body).not.toHaveProperty("keySlotId");
    expect(result.body).not.toHaveProperty("parkingSpotId");
  });

  it("requires Staff authentication and rejects authority fields", async () => {
    const fixture = await context.createMarkReadyFixture();
    expect(
      await post(fixture.sessionId, { expectedSessionVersion: 6 }),
    ).toMatchObject({ status: 401 });
    const token = `ready-${randomUUID()}`;
    principals.set(`Bearer ${token}`, fixture.userId);
    expect(
      await post(
        fixture.sessionId,
        { expectedSessionVersion: 6, taskId: fixture.retrievalTaskId },
        token,
      ),
    ).toMatchObject({ body: { code: "REQUEST_INVALID" }, status: 400 });
  });
});
