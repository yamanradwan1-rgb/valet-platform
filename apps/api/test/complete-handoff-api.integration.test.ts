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
import { CompleteHandoffController } from "../src/modules/retrieval/complete-handoff.controller";
import { CompleteHandoffService } from "../src/modules/retrieval/complete-handoff.service";
import { CompleteHandoffTestContext } from "./complete-handoff-test-context";

const context = new CompleteHandoffTestContext("api");
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
  controllers: [CompleteHandoffController],
  imports: [HttpInfrastructureModule],
  providers: [
    CompleteHandoffService,
    { provide: RUNTIME_POSTGRES_POOL, useFactory: () => context.runtimePool },
    { provide: STAFF_PRINCIPAL_RESOLVER, useValue: principalResolver },
  ],
})
class CompleteHandoffTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes(CompleteHandoffController);
  }
}

async function post(sessionId: string, body: unknown, token?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  const response = await fetch(
    `${baseUrl}/v1/staff/valet-sessions/${sessionId}/complete-handoff`,
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
  app = await NestFactory.create(CompleteHandoffTestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  baseUrl = await app.getUrl();
}, 120_000);

afterAll(async () => {
  await app?.close();
  await context.teardown();
}, 60_000);

describe("VAL-006G complete handoff API", () => {
  it("requires a Staff bearer", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    expect(
      await post(fixture.sessionId, { expectedSessionVersion: 9 }),
    ).toMatchObject({ status: 401 });
  });

  it("requires the strict expectedSessionVersion-only body", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    const token = `complete-${randomUUID()}`;
    principals.set(`Bearer ${token}`, fixture.userId);
    expect(await post(fixture.sessionId, {}, token)).toMatchObject({
      body: { code: "REQUEST_INVALID" },
      status: 400,
    });
    expect(
      await post(
        fixture.sessionId,
        { expectedSessionVersion: 9, taskId: fixture.retrievalTaskId },
        token,
      ),
    ).toMatchObject({ body: { code: "REQUEST_INVALID" }, status: 400 });
  });

  it("returns the narrow successful terminal projection", async () => {
    const fixture = await context.prepareStandard("DYNAMIC_QR");
    const token = `complete-${randomUUID()}`;
    principals.set(`Bearer ${token}`, fixture.userId);
    const response = await post(
      fixture.sessionId,
      { expectedSessionVersion: 9 },
      token,
    );
    expect(response).toMatchObject({
      body: {
        retrievalRequestStatus: "COMPLETED",
        sessionId: fixture.sessionId,
        sessionVersion: 10,
        state: "COMPLETED",
        taskId: fixture.retrievalTaskId,
        taskStatus: "COMPLETED",
        taskVersion: 5,
      },
      status: 200,
    });
    expect(response.requestId).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
    expect(JSON.stringify(response.body)).not.toMatch(
      /verification|key.?slot|pickup|qr|secret|bearer|organization|location/i,
    );
  });

  it("maps release-ineligible proof without leaking proof details", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    const token = `complete-${randomUUID()}`;
    principals.set(`Bearer ${token}`, fixture.userId);
    const response = await post(
      fixture.sessionId,
      { expectedSessionVersion: 8 },
      token,
    );
    expect(response).toMatchObject({
      body: {
        code: "HANDOFF_VERIFICATION_FAILED",
        message: "Handoff verification failed.",
      },
      status: 409,
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /hash|verifier|pickup.?code|qr.?payload|expired|policy/i,
    );
  });

  it("maps an unsatisfied financial release to the stable generic conflict", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    await context.adminPool.query(
      `UPDATE organizations SET release_requires_payment = true WHERE id = $1`,
      [fixture.organizationId],
    );
    const before = await context.releaseEffects(fixture);
    const token = `complete-${randomUUID()}`;
    principals.set(`Bearer ${token}`, fixture.userId);
    const response = await post(
      fixture.sessionId,
      { expectedSessionVersion: 9 },
      token,
    );
    expect(response).toMatchObject({
      body: {
        code: "FINANCIAL_RELEASE_NOT_SATISFIED",
        message: "The financial release requirement is not satisfied.",
      },
      status: 409,
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /amount|method|paid|payment|provider|refund|status/i,
    );
    expect(await context.releaseEffects(fixture)).toEqual(before);
  });
});
