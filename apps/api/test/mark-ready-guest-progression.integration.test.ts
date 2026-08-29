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
import { CompleteHandoffTestContext } from "./complete-handoff-test-context";

const context = new CompleteHandoffTestContext("guest_progression");
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

async function authorizeGuest(sessionId: string): Promise<string> {
  const rawToken = randomBytes(32).toString("base64url");
  await context.adminPool.query(
    `UPDATE valet_sessions
     SET customer_access_token_hash = $2,
         customer_access_expires_at = clock_timestamp() + interval '1 hour',
         customer_access_revoked_at = NULL
     WHERE id = $1`,
    [sessionId, hashGuestAccessToken(rawToken)],
  );
  return rawToken;
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
    const rawToken = await authorizeGuest(fixture.sessionId);
    expect(await guestSession(rawToken)).toMatchObject({
      body: { readyAt: null, state: "RETRIEVING" },
      status: 200,
    });
    await context.markReady(fixture);
    const persisted = await context.adminPool.query<{ ready_at: Date }>(
      `SELECT ready_at FROM valet_sessions WHERE id = $1`,
      [fixture.sessionId],
    );
    const expectedReadyAt = persisted.rows[0]!.ready_at.toISOString();
    const guest = await guestSession(rawToken);
    expect(guest).toMatchObject({
      body: {
        readyAt: expectedReadyAt,
        state: "READY",
        valetSessionId: fixture.sessionId,
      },
      status: 200,
    });
    expect((await guestSession(rawToken)).body.readyAt).toBe(expectedReadyAt);

    const handoffFixture = { ...fixture, guestToken: rawToken };
    await context.initiate(handoffFixture);
    expect(await guestSession(rawToken)).toMatchObject({
      body: { readyAt: expectedReadyAt, state: "HANDOFF_PENDING" },
      status: 200,
    });
    await context.abort(handoffFixture);
    expect(await guestSession(rawToken)).toMatchObject({
      body: { readyAt: expectedReadyAt, state: "READY" },
      status: 200,
    });
    await context.initiate(handoffFixture, 9);
    const material = await context.issue(handoffFixture, "PICKUP_CODE");
    if (material.method !== "PICKUP_CODE") {
      throw new Error("Expected pickup-code handoff material.");
    }
    await context.verify(
      handoffFixture,
      "PICKUP_CODE",
      material.pickupCode,
      10,
    );
    await context.complete(handoffFixture, fixture.userId, 11);
    expect(await guestSession(rawToken)).toMatchObject({
      body: { readyAt: expectedReadyAt, state: "COMPLETED" },
      status: 200,
    });
    expect(guest.headers.get("cache-control")).toContain("no-store");
    expect(guest.headers.get("pragma")).toBe("no-cache");
    expect(JSON.stringify(guest.body)).not.toMatch(
      /keySlot|parkingSpot|parkingZone|assignee|taskId|audit|latitude|longitude/i,
    );
  });

  it("never exposes another session's READY identity", async () => {
    const owned = await context.createMarkReadyFixture();
    const foreign = await context.createMarkReadyFixture();
    const ownedToken = await authorizeGuest(owned.sessionId);
    const foreignToken = await authorizeGuest(foreign.sessionId);
    await context.markReady(foreign);
    const foreignGuest = await guestSession(foreignToken);

    expect(foreignGuest.body.readyAt).toEqual(expect.any(String));
    expect(await guestSession(ownedToken)).toMatchObject({
      body: {
        readyAt: null,
        valetSessionId: owned.sessionId,
      },
      status: 200,
    });
    expect((await guestSession(ownedToken)).body.readyAt).not.toBe(
      foreignGuest.body.readyAt,
    );

    const invalid = await guestSession(randomBytes(32).toString("base64url"));
    expect(invalid.status).toBe(401);
    expect(invalid.body).not.toHaveProperty("readyAt");
  });
});
