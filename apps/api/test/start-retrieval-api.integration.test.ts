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
import { StartRetrievalController } from "../src/modules/retrieval/start-retrieval.controller";
import { StartRetrievalService } from "../src/modules/retrieval/start-retrieval.service";
import { StartRetrievalTestContext } from "./start-retrieval-test-context";

const context = new StartRetrievalTestContext("api");
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
  controllers: [StartRetrievalController],
  imports: [HttpInfrastructureModule],
  providers: [
    StartRetrievalService,
    { provide: RUNTIME_POSTGRES_POOL, useFactory: () => context.runtimePool },
    { provide: STAFF_PRINCIPAL_RESOLVER, useValue: principalResolver },
  ],
})
class TestStartRetrievalModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes(StartRetrievalController);
  }
}

async function post(sessionId: string, body: unknown, token?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  const response = await fetch(
    `${baseUrl}/v1/staff/valet-sessions/${sessionId}/start-retrieval`,
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
  app = await NestFactory.create(TestStartRetrievalModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  baseUrl = await app.getUrl();
}, 120_000);

afterAll(async () => {
  await app?.close();
  await context.teardown();
}, 60_000);

describe("VAL-006D Start Retrieval API", () => {
  it("starts on the canonical route with a minimal response", async () => {
    const fixture = await context.createStartRetrievalFixture();
    const token = `retrieval-${randomUUID()}`;
    principals.set(`Bearer ${token}`, fixture.userId);
    const result = await post(
      fixture.sessionId,
      { expectedSessionVersion: 5, expectedTaskVersion: 3 },
      token,
    );
    expect(result).toMatchObject({
      body: {
        retrievalStartedAt: expect.any(String),
        sessionId: fixture.sessionId,
        sessionVersion: 6,
        state: "RETRIEVING",
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

  it("rejects authority fields and requires Staff authentication", async () => {
    const fixture = await context.createStartRetrievalFixture();
    const unauthenticated = await post(fixture.sessionId, {
      expectedSessionVersion: 5,
      expectedTaskVersion: 3,
    });
    expect(unauthenticated.status).toBe(401);
    const token = `retrieval-${randomUUID()}`;
    principals.set(`Bearer ${token}`, fixture.userId);
    const invalid = await post(
      fixture.sessionId,
      {
        expectedSessionVersion: 5,
        expectedTaskVersion: 3,
        taskId: fixture.retrievalTaskId,
      },
      token,
    );
    expect(invalid).toMatchObject({
      body: { code: "REQUEST_INVALID" },
      status: 400,
    });
  });

  it("maps key readiness to a bounded conflict", async () => {
    const fixture = await context.createStartRetrievalFixture();
    await context.adminPool.query(
      `UPDATE key_slots SET status = 'INACTIVE' WHERE id = $1`,
      [fixture.keySlotId],
    );
    const token = `retrieval-${randomUUID()}`;
    principals.set(`Bearer ${token}`, fixture.userId);
    const result = await post(
      fixture.sessionId,
      { expectedSessionVersion: 5, expectedTaskVersion: 3 },
      token,
    );
    expect(result).toMatchObject({
      body: { code: "KEY_CUSTODY_NOT_READY" },
      status: 409,
    });
    expect(JSON.stringify(result.body)).not.toMatch(
      /constraint|SELECT|key_slots/i,
    );
  });
});
