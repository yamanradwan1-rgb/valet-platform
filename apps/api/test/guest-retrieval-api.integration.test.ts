import { randomBytes } from "node:crypto";

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
import { GuestAccessController } from "../src/modules/guest-access/guest-access.controller";
import { GuestAccessService } from "../src/modules/guest-access/guest-access.service";
import { GuestRetrievalController } from "../src/modules/retrieval/guest-retrieval.controller";
import { RequestRetrievalService } from "../src/modules/retrieval/request-retrieval.service";
import { GuestRetrievalTestContext } from "./guest-retrieval-test-context";

const originalSecret = process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
const originalCidrs = process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS;
const context = new GuestRetrievalTestContext("api");
let app: INestApplication;
let baseUrl: string;

@Module({
  controllers: [GuestAccessController, GuestRetrievalController],
  imports: [HttpInfrastructureModule],
  providers: [
    AntiAbuseKeyDeriver,
    AntiAbuseService,
    GuestAccessService,
    RequestRetrievalService,
    TrustedClientAddressResolver,
    { provide: RUNTIME_POSTGRES_POOL, useFactory: () => context.runtimePool },
  ],
})
class TestGuestRetrievalModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(GuestAccessController, GuestRetrievalController);
  }
}

async function request(
  path: string,
  options: {
    readonly body?: unknown;
    readonly method?: "GET" | "POST";
    readonly token?: string;
  } = {},
) {
  const headers: Record<string, string> = {};
  if (options.token !== undefined) {
    headers.authorization = `Bearer ${options.token}`;
  }
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "POST",
    headers,
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  return {
    body: (await response.json()) as Record<string, unknown>,
    cacheControl: response.headers.get("cache-control"),
    status: response.status,
  };
}

beforeAll(async () => {
  process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = randomBytes(32).toString("base64url");
  process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS = "";
  await context.setup();
  app = await NestFactory.create(TestGuestRetrievalModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
}, 120_000);

afterAll(async () => {
  await app?.close();
  await context.teardown();
  if (originalSecret === undefined) delete process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
  else process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = originalSecret;
  if (originalCidrs === undefined) delete process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS;
  else process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS = originalCidrs;
}, 60_000);

describe("VAL-006B guest Retrieval API", () => {
  it("creates one guest-safe Retrieval lifecycle and makes retry non-mutating", async () => {
    const fixture = await context.createParkedGuestFixture();
    const before = await context.snapshot(fixture.sessionId);
    expect(before.session.customer_id).toBeNull();

    const first = await request("/v1/guest/session/request-retrieval", {
      body: {},
      token: fixture.rawToken,
    });
    expect(first.status).toBe(200);
    expect(first.cacheControl).toContain("no-store");
    expect(first.body).toEqual({
      state: "REQUESTED",
      valetSessionId: fixture.sessionId,
      vehicle: { color: null, make: null, model: null },
    });

    const afterFirst = await context.snapshot(fixture.sessionId);
    expect(afterFirst.session.state).toBe("REQUESTED");
    expect(afterFirst.session.version).toBe(before.session.version + 1);
    expect(afterFirst.session.retrieval_requested_at).toBeInstanceOf(Date);
    expect(afterFirst.requests).toEqual([
      {
        requested_by_customer_id: null,
        requested_by_membership_id: null,
        status: "OPEN",
      },
    ]);
    expect(afterFirst.tasks).toEqual([
      expect.objectContaining({
        current_assignee_membership_id: null,
        status: "QUEUED",
        task_type: "RETRIEVAL",
        version: 1,
      }),
    ]);
    expect(afterFirst.dispatch).toEqual([
      { actor_membership_id: null, event_type: "QUEUED" },
    ]);
    expect(afterFirst.audit).toEqual([
      expect.objectContaining({
        actor_membership_id: null,
        event_type: "RETRIEVAL_REQUESTED",
        metadata_json: expect.objectContaining({
          actorType: "GUEST",
          fromState: "PARKED",
          requesterType: "CUSTOMER",
          toState: "REQUESTED",
        }),
      }),
    ]);

    const retry = await request("/v1/guest/session/request-retrieval", {
      body: {},
      token: fixture.rawToken,
    });
    expect(retry.status).toBe(200);
    const afterRetry = await context.snapshot(fixture.sessionId);
    expect(afterRetry.session.version).toBe(afterFirst.session.version);
    expect(afterRetry.session.retrieval_requested_at).toEqual(
      afterFirst.session.retrieval_requested_at,
    );
    expect(afterRetry.requests).toHaveLength(1);
    expect(afterRetry.tasks).toHaveLength(1);
    expect(afterRetry.dispatch).toHaveLength(1);
    expect(afterRetry.audit).toHaveLength(1);
  });

  it("serializes simultaneous first presses into one mutation", async () => {
    const fixture = await context.createParkedGuestFixture();
    const before = await context.snapshot(fixture.sessionId);
    const results = await Promise.all([
      request("/v1/guest/session/request-retrieval", { body: {}, token: fixture.rawToken }),
      request("/v1/guest/session/request-retrieval", { body: {}, token: fixture.rawToken }),
    ]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    const after = await context.snapshot(fixture.sessionId);
    expect(after.session.version).toBe(before.session.version + 1);
    expect(after.requests).toHaveLength(1);
    expect(after.tasks).toHaveLength(1);
    expect(after.dispatch).toHaveLength(1);
    expect(after.audit).toHaveLength(1);
  });

  it("rejects invalid credentials and unsupported physical state without work", async () => {
    const parked = await context.createParkedGuestFixture();
    const invalid = await request("/v1/guest/session/request-retrieval", {
      body: {},
      token: randomBytes(32).toString("base64url"),
    });
    expect(invalid.status).toBe(401);
    expect(invalid.body.code).toBe("GUEST_ACCESS_INVALID");
    expect((await context.snapshot(parked.sessionId)).requests).toHaveLength(0);

    const parking = await context.createParkingGuestFixture();
    const conflict = await request("/v1/guest/session/request-retrieval", {
      body: {},
      token: parking.rawToken,
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("INVALID_STATE_TRANSITION");
    expect((await context.snapshot(parking.sessionId)).requests).toHaveLength(0);
  });

  it("rejects non-empty body or query before creating Retrieval work", async () => {
    const fixture = await context.createParkedGuestFixture();
    for (const result of [
      await request("/v1/guest/session/request-retrieval", {
        body: { sessionId: fixture.sessionId },
        token: fixture.rawToken,
      }),
      await request("/v1/guest/session/request-retrieval?priority=VIP", {
        body: {},
        token: fixture.rawToken,
      }),
    ]) {
      expect(result.status).toBe(400);
      expect(result.body.code).toBe("REQUEST_INVALID");
    }
    expect((await context.snapshot(fixture.sessionId)).requests).toHaveLength(0);
  });

  it("shares the existing guest-token quota across GET and POST", async () => {
    const fixture = await context.createParkedGuestFixture();
    const key = new AntiAbuseKeyDeriver().derive("v1:guest-token", fixture.rawToken);
    await context.adminPool.query(
      `INSERT INTO anti_abuse_events (scope, key_hash, state)
       SELECT 'v1:guest-token', $1, 'COUNTED'
       FROM generate_series(1, 179)`,
      [key.keyHash],
    );
    const read = await request("/v1/guest/session", {
      method: "GET",
      token: fixture.rawToken,
    });
    expect(read.status).toBe(200);
    const blocked = await request("/v1/guest/session/request-retrieval", {
      body: {},
      token: fixture.rawToken,
    });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("GUEST_ACCESS_RATE_LIMITED");
    expect((await context.snapshot(fixture.sessionId)).requests).toHaveLength(0);
  });
});
