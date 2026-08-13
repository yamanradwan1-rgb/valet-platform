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
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { AntiAbuseService } from "../src/modules/anti-abuse/anti-abuse.service";
import { TrustedClientAddressResolver } from "../src/modules/anti-abuse/client-address";
import {
  FailClosedStaffPrincipalResolver,
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../src/modules/auth/staff-principal";
import { GuestAccessService } from "../src/modules/guest-access/guest-access.service";
import { HandoffGuestController } from "../src/modules/retrieval/handoff-guest.controller";
import { HandoffStaffController } from "../src/modules/retrieval/handoff-staff.controller";
import { HandoffService } from "../src/modules/retrieval/handoff.service";
import { HandoffTestContext } from "./handoff-test-context";

const context = new HandoffTestContext("api");
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
  controllers: [HandoffGuestController, HandoffStaffController],
  imports: [HttpInfrastructureModule],
  providers: [
    AntiAbuseKeyDeriver,
    AntiAbuseService,
    GuestAccessService,
    HandoffService,
    TrustedClientAddressResolver,
    { provide: RUNTIME_POSTGRES_POOL, useFactory: () => context.runtimePool },
    { provide: STAFF_PRINCIPAL_RESOLVER, useValue: principalResolver },
  ],
})
class HandoffTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(HandoffGuestController, HandoffStaffController);
  }
}

async function post(path: string, body: unknown, token?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, {
    body: JSON.stringify(body),
    headers,
    method: "POST",
  });
  return {
    body: (await response.json()) as Record<string, unknown>,
    cacheControl: response.headers.get("cache-control"),
    requestId: response.headers.get("x-request-id"),
    status: response.status,
  };
}

beforeAll(async () => {
  await context.setup();
  app = await NestFactory.create(HandoffTestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  baseUrl = await app.getUrl();
}, 120_000);

afterAll(async () => {
  await app?.close();
  await context.teardown();
}, 60_000);

describe("VAL-006F secure handoff API", () => {
  it("uses explicit staff initiation and one-time no-store guest issuance", async () => {
    const fixture = await context.createHandoffFixture();
    const staffToken = `handoff-${randomUUID()}`;
    principals.set(`Bearer ${staffToken}`, fixture.userId);
    const initiated = await post(
      `/v1/staff/valet-sessions/${fixture.sessionId}/initiate-handoff`,
      { expectedSessionVersion: 7 },
      staffToken,
    );
    expect(initiated).toMatchObject({
      body: {
        sessionId: fixture.sessionId,
        sessionVersion: 8,
        state: "HANDOFF_PENDING",
      },
      status: 200,
    });
    const issued = await post(
      "/v1/guest/session/handoff-verification/issue",
      { method: "PICKUP_CODE" },
      fixture.guestToken,
    );
    expect(issued).toMatchObject({
      body: {
        method: "PICKUP_CODE",
        pickupCode: expect.stringMatching(/^\d{4}$/),
        state: "HANDOFF_PENDING",
        valetSessionId: fixture.sessionId,
      },
      cacheControl: "no-store",
      status: 200,
    });
    expect(issued.requestId).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
    for (const forbidden of [
      "organizationId",
      "locationId",
      "taskId",
      "verificationId",
      "secretHash",
    ]) {
      expect(issued.body).not.toHaveProperty(forbidden);
    }
  });

  it("requires staff authentication and strict authority-free bodies", async () => {
    const fixture = await context.createHandoffFixture();
    expect(
      await post(
        `/v1/staff/valet-sessions/${fixture.sessionId}/initiate-handoff`,
        { expectedSessionVersion: 7 },
      ),
    ).toMatchObject({ status: 401 });
    const staffToken = `handoff-${randomUUID()}`;
    principals.set(`Bearer ${staffToken}`, fixture.userId);
    expect(
      await post(
        `/v1/staff/valet-sessions/${fixture.sessionId}/initiate-handoff`,
        { expectedSessionVersion: 7, taskId: fixture.retrievalTaskId },
        staffToken,
      ),
    ).toMatchObject({ body: { code: "REQUEST_INVALID" }, status: 400 });
  });
});
