import { randomBytes } from "node:crypto";

import {
  MiddlewareConsumer,
  Module,
  type INestApplication,
  type NestModule,
} from "@nestjs/common";
import { APP_FILTER, NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RUNTIME_POSTGRES_POOL } from "../src/common/database/runtime-database.module";
import { ApiExceptionFilter } from "../src/common/http/api-exception.filter";
import { ApiOperationRunner } from "../src/common/http/api-operation-runner";
import { RequestIdMiddleware } from "../src/common/http/api-request";
import {
  MONOTONIC_CLOCK,
  OPERATION_OBSERVER,
} from "../src/common/observability/operation-observability";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { AntiAbuseService } from "../src/modules/anti-abuse/anti-abuse.service";
import { TrustedClientAddressResolver } from "../src/modules/anti-abuse/client-address";
import { GuestAccessController } from "../src/modules/guest-access/guest-access.controller";
import { GuestAccessService } from "../src/modules/guest-access/guest-access.service";
import { hashGuestAccessToken } from "../src/modules/valet-sessions/guest-access-command";
import { MarkReadyTestContext } from "./mark-ready-test-context";

const context = new MarkReadyTestContext("guest");
let app: INestApplication;
let baseUrl: string;

@Module({
  controllers: [GuestAccessController],
  providers: [
    ApiOperationRunner,
    AntiAbuseKeyDeriver,
    AntiAbuseService,
    GuestAccessService,
    TrustedClientAddressResolver,
    RequestIdMiddleware,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: RUNTIME_POSTGRES_POOL, useFactory: () => context.runtimePool },
    { provide: MONOTONIC_CLOCK, useValue: { now: () => 1 } },
    { provide: OPERATION_OBSERVER, useValue: { observe: () => undefined } },
  ],
})
class MarkReadyGuestTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes(GuestAccessController);
  }
}

async function guestSession(rawToken: string) {
  const response = await fetch(`${baseUrl}/v1/guest/session`, {
    headers: { authorization: `Bearer ${rawToken}` },
  });
  return {
    body: (await response.json()) as Record<string, unknown>,
    headers: response.headers,
    status: response.status,
  };
}

beforeAll(async () => {
  process.env.ANTI_ABUSE_HMAC_SECRET_B64URL =
    randomBytes(32).toString("base64url");
  process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS = "";
  await context.setup();
  app = await NestFactory.create(MarkReadyGuestTestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  baseUrl = await app.getUrl();
}, 120_000);

afterAll(async () => {
  await app?.close();
  await context.teardown();
}, 60_000);

describe("VAL-006E guest READY progression", () => {
  it("exposes READY through the existing guest-safe, no-store read boundary", async () => {
    const fixture = await context.createMarkReadyFixture();
    const rawToken = randomBytes(32).toString("base64url");
    await context.adminPool.query(
      `UPDATE valet_sessions
       SET customer_access_token_hash = $2,
           customer_access_expires_at = clock_timestamp() + interval '1 hour',
           customer_access_revoked_at = NULL
       WHERE id = $1`,
      [fixture.sessionId, hashGuestAccessToken(rawToken)],
    );
    await context.markReady(fixture);
    const guest = await guestSession(rawToken);
    expect(guest).toMatchObject({
      body: { state: "READY", valetSessionId: fixture.sessionId },
      status: 200,
    });
    expect(guest.headers.get("cache-control")).toContain("no-store");
    expect(guest.headers.get("pragma")).toBe("no-cache");
    expect(JSON.stringify(guest.body)).not.toMatch(
      /keySlot|parkingSpot|parkingZone|assignee|taskId|audit|latitude|longitude/i,
    );
  });
});
