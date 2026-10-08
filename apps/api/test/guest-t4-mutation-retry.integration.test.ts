import { randomBytes } from "node:crypto";

import {
  MiddlewareConsumer,
  Module,
  type INestApplication,
  type NestModule,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createRuntimePostgresPool,
  type PostgresPool,
} from "../src/common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../src/common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../src/common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../src/common/http/api-request";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { AntiAbuseService } from "../src/modules/anti-abuse/anti-abuse.service";
import { TrustedClientAddressResolver } from "../src/modules/anti-abuse/client-address";
import { GuestAccessService } from "../src/modules/guest-access/guest-access.service";
import { GuestBrowserSessionService } from "../src/modules/guest-access/guest-browser-session.service";
import { GuestAuthOriginPolicy } from "../src/modules/guest-access/guest-browser-transport";
import { GuestRetrievalController } from "../src/modules/retrieval/guest-retrieval.controller";
import { RetrievalService } from "../src/modules/retrieval/retrieval.service";
import { StaffPushOperationalPolicy } from "../src/modules/staff-push/staff-push-operational-policy";
import { hashGuestAccessToken } from "../src/modules/valet-sessions/guest-access-command";
import { ConfirmParkedTestContext } from "./confirm-parked-test-context";
import { loadGuestRetrievalEffects } from "./guest-retrieval-effects";
import { guestAdmissionProviders } from "./guest-request-admission-test-providers";
import { syntheticStaffPushPolicy } from "./staff-push-policy-test-value";

interface RetrievalPeer {
  readonly app: INestApplication;
  readonly baseUrl: string;
}

describe("Guest T4 cross-replica mutation retry safety", () => {
  const context = new ConfirmParkedTestContext("guest_t4_mutation_retry");
  const priorEnvironment = {
    antiAbuseSecret: process.env.ANTI_ABUSE_HMAC_SECRET_B64URL,
    ratePolicy: process.env.GUEST_T3_RATE_POLICY,
  };
  let secondary: RetrievalPeer;
  let secondaryPool: PostgresPool;
  let primary: RetrievalPeer;

  beforeAll(async () => {
    process.env.ANTI_ABUSE_HMAC_SECRET_B64URL =
      randomBytes(32).toString("base64url");
    process.env.GUEST_T3_RATE_POLICY = "COMPATIBILITY";
    await context.setup();
    primary = await startRetrievalPeer(context.runtimePool);
    secondaryPool = createRuntimePostgresPool(context.runtimeUrl);
    secondary = await startRetrievalPeer(secondaryPool);
  }, 120_000);

  afterAll(async () => {
    await primary?.app.close();
    await secondary?.app.close();
    await secondaryPool?.end();
    await context.teardown();
    restoreEnvironment(
      "ANTI_ABUSE_HMAC_SECRET_B64URL",
      priorEnvironment.antiAbuseSecret,
    );
    restoreEnvironment("GUEST_T3_RATE_POLICY", priorEnvironment.ratePolicy);
  }, 60_000);

  async function restartSecondary(): Promise<void> {
    await secondary.app.close();
    await secondaryPool.end();
    secondaryPool = createRuntimePostgresPool(context.runtimeUrl);
    secondary = await startRetrievalPeer(secondaryPool);
  }

  it("keeps an explicit cross-replica retry to one retrieval lifecycle", async () => {
    const fixture = await context.createConfirmParkedFixture();
    await context.confirm(fixture);
    const token = randomBytes(32).toString("base64url");
    await context.adminPool.query(
      `UPDATE valet_sessions
       SET customer_access_token_hash=$2,
           customer_access_expires_at=clock_timestamp()+interval '1 hour',
           customer_access_revoked_at=NULL
       WHERE id=$1`,
      [fixture.sessionId, hashGuestAccessToken(token)],
    );

    const first = await postRetrieval(primary.baseUrl, token);
    const retry = await postRetrieval(secondary.baseUrl, token);
    expect(first).toMatchObject({
      body: { state: "REQUESTED", valetSessionId: fixture.sessionId },
      status: 200,
    });
    expect(retry).toMatchObject({
      body: { state: "REQUESTED", valetSessionId: fixture.sessionId },
      status: 200,
    });
    const afterRetry = await loadGuestRetrievalEffects(
      context.adminPool,
      fixture.sessionId,
    );
    expect(afterRetry).toMatchObject({
      audit_count: 1,
      dispatch_count: 1,
      intent_count: 1,
      request_count: 1,
      session_state: "REQUESTED",
      task_count: 1,
    });

    await restartSecondary();
    const afterRestartRetry = await postRetrieval(secondary.baseUrl, token);
    expect(afterRestartRetry.status).toBe(200);
    expect(
      await loadGuestRetrievalEffects(context.adminPool, fixture.sessionId),
    ).toEqual(afterRetry);
  });
});

async function startRetrievalPeer(pool: PostgresPool): Promise<RetrievalPeer> {
  @Module({
    controllers: [GuestRetrievalController],
    imports: [HttpInfrastructureModule],
    providers: [
      AntiAbuseKeyDeriver,
      AntiAbuseService,
      GuestAccessService,
      GuestAuthOriginPolicy,
      GuestBrowserSessionService,
      ...guestAdmissionProviders,
      RetrievalService,
      {
        provide: StaffPushOperationalPolicy,
        useValue: syntheticStaffPushPolicy,
      },
      TrustedClientAddressResolver,
      { provide: RUNTIME_POSTGRES_POOL, useValue: pool },
    ],
  })
  class RetrievalPeerModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
      consumer.apply(RequestIdMiddleware).forRoutes(GuestRetrievalController);
    }
  }

  const app = await NestFactory.create(RetrievalPeerModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  return { app, baseUrl: await app.getUrl() };
}

async function postRetrieval(baseUrl: string, token: string) {
  const response = await fetch(
    `${baseUrl}/v1/guest/session/request-retrieval`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: "{}",
    },
  );
  const text = await response.text();
  return {
    body: text === "" ? {} : (JSON.parse(text) as Record<string, unknown>),
    status: response.status,
  };
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
