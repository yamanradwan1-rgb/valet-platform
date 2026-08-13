import { randomBytes, randomUUID } from "node:crypto";

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
import { GuestAccessService } from "../src/modules/guest-access/guest-access.service";
import { GuestRetrievalController } from "../src/modules/retrieval/guest-retrieval.controller";
import { RetrievalService } from "../src/modules/retrieval/retrieval.service";
import { hashGuestAccessToken } from "../src/modules/valet-sessions/guest-access-command";
import { ConfirmParkedTestContext } from "./confirm-parked-test-context";

const context = new ConfirmParkedTestContext("6b");
let app: INestApplication;
let baseUrl: string;

@Module({
  controllers: [GuestRetrievalController],
  providers: [
    ApiOperationRunner,
    AntiAbuseKeyDeriver,
    AntiAbuseService,
    GuestAccessService,
    RetrievalService,
    TrustedClientAddressResolver,
    RequestIdMiddleware,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: RUNTIME_POSTGRES_POOL, useFactory: () => context.runtimePool },
    { provide: MONOTONIC_CLOCK, useValue: { now: () => 1 } },
    { provide: OPERATION_OBSERVER, useValue: { observe: () => undefined } },
  ],
})
class GuestRetrievalTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes(GuestRetrievalController);
  }
}

async function createGuestFixture(options: { customer?: boolean } = {}) {
  const fixture = await context.createConfirmParkedFixture();
  await context.confirm(fixture);
  const rawToken = randomBytes(32).toString("base64url");
  let customerId: string | null = null;
  if (options.customer === true) {
    customerId = randomUUID();
    await context.adminPool.query(
      `INSERT INTO customers (id, organization_id, phone_normalized, display_name, updated_at)
       VALUES ($1, $2, $3, 'Guest customer', transaction_timestamp())`,
      [customerId, fixture.organizationId, `+962${Date.now()}${Math.floor(Math.random() * 9)}`],
    );
  }
  await context.adminPool.query(
    `UPDATE valet_sessions
     SET customer_access_token_hash = $2, customer_access_expires_at = clock_timestamp() + interval '1 hour',
         customer_access_revoked_at = NULL, customer_id = $3
     WHERE id = $1`,
    [fixture.sessionId, hashGuestAccessToken(rawToken), customerId],
  );
  return { ...fixture, customerId, rawToken };
}

async function post(
  rawToken: string,
  options: { body?: unknown; query?: string } = {},
) {
  const response = await fetch(
    `${baseUrl}/v1/guest/session/request-retrieval${options.query ?? ""}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${rawToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(options.body ?? {}),
    },
  );
  return {
    body: (await response.json()) as Record<string, unknown>,
    headers: response.headers,
    status: response.status,
  };
}

async function effects(sessionId: string) {
  const result = await context.adminPool.query<{
    audit_count: number;
    audit_actor: string | null;
    dispatch_count: number;
    dispatch_actor: string | null;
    request_count: number;
    requested_at: Date | null;
    requested_by_customer_id: string | null;
    session_state: string;
    session_version: number;
    task_assignee: string | null;
    task_count: number;
    task_status: string | null;
  }>(
    `SELECT
       (SELECT count(*)::integer FROM retrieval_requests WHERE valet_session_id = $1 AND status = 'OPEN') AS request_count,
       (SELECT count(*)::integer FROM tasks WHERE valet_session_id = $1 AND task_type = 'RETRIEVAL' AND status = 'QUEUED') AS task_count,
       (SELECT count(*)::integer FROM dispatch_events AS event
        INNER JOIN tasks AS event_task ON event_task.id = event.task_id
        WHERE event.valet_session_id = $1 AND event.event_type = 'QUEUED'
          AND event_task.task_type = 'RETRIEVAL') AS dispatch_count,
       (SELECT event.actor_membership_id::text FROM dispatch_events AS event
        INNER JOIN tasks AS event_task ON event_task.id = event.task_id
        WHERE event.valet_session_id = $1 AND event.event_type = 'QUEUED'
          AND event_task.task_type = 'RETRIEVAL') AS dispatch_actor,
       (SELECT count(*)::integer FROM audit_events WHERE valet_session_id = $1 AND event_type = 'RETRIEVAL_REQUESTED') AS audit_count,
       (SELECT actor_membership_id::text FROM audit_events
        WHERE valet_session_id = $1 AND event_type = 'RETRIEVAL_REQUESTED') AS audit_actor,
       session.state::text AS session_state, session.version AS session_version,
       session.retrieval_requested_at AS requested_at,
       request.requested_by_customer_id::text,
       task.status::text AS task_status, task.current_assignee_membership_id::text AS task_assignee
     FROM valet_sessions AS session
     LEFT JOIN retrieval_requests AS request ON request.valet_session_id = session.id AND request.status = 'OPEN'
     LEFT JOIN tasks AS task ON task.valet_session_id = session.id AND task.task_type = 'RETRIEVAL' AND task.status = 'QUEUED'
     WHERE session.id = $1`,
    [sessionId],
  );
  return result.rows[0]!;
}

beforeAll(async () => {
  process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = randomBytes(32).toString("base64url");
  process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS = "";
  await context.setup();
  app = await NestFactory.create(GuestRetrievalTestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  baseUrl = await app.getUrl();
}, 120_000);

afterAll(async () => {
  await app?.close();
  await context.teardown();
}, 60_000);

describe("VAL-006B guest Retrieval request", () => {
  it("creates one guest-originated REQUESTED lifecycle and keeps retries stable", async () => {
    const fixture = await createGuestFixture();
    const first = await post(fixture.rawToken);
    const afterFirst = await effects(fixture.sessionId);
    const retry = await post(fixture.rawToken);
    const afterRetry = await effects(fixture.sessionId);
    expect(first).toMatchObject({ body: { state: "REQUESTED", valetSessionId: fixture.sessionId }, status: 200 });
    expect(retry).toMatchObject({ body: { state: "REQUESTED", valetSessionId: fixture.sessionId }, status: 200 });
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(first.headers.get("pragma")).toBe("no-cache");
    expect(Object.keys(first.body).sort()).toEqual(["state", "valetSessionId", "vehicle"]);
    expect(Object.keys(first.body.vehicle as Record<string, unknown>).sort()).toEqual(["color", "make", "model"]);
    expect(afterFirst).toMatchObject({ audit_actor: null, audit_count: 1, dispatch_actor: null, dispatch_count: 1, request_count: 1, session_state: "REQUESTED", session_version: 5, task_assignee: null, task_count: 1, task_status: "QUEUED" });
    expect(afterFirst.requested_at).toBeInstanceOf(Date);
    expect(afterRetry).toEqual(afterFirst);
  });

  it("handles concurrent duplicate presses with one lifecycle", async () => {
    const fixture = await createGuestFixture();
    const results = await Promise.all([post(fixture.rawToken), post(fixture.rawToken)]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(await effects(fixture.sessionId)).toMatchObject({ audit_count: 1, dispatch_count: 1, request_count: 1, session_state: "REQUESTED", session_version: 5, task_count: 1 });
  });

  it("preserves optional Customer attribution without synthesizing one", async () => {
    const withoutCustomer = await createGuestFixture();
    const customersBefore = await context.adminPool.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM customers WHERE organization_id = $1",
      [withoutCustomer.organizationId],
    );
    await expect(post(withoutCustomer.rawToken)).resolves.toMatchObject({ status: 200 });
    expect((await effects(withoutCustomer.sessionId)).requested_by_customer_id).toBeNull();
    const customersAfter = await context.adminPool.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM customers WHERE organization_id = $1",
      [withoutCustomer.organizationId],
    );
    expect(customersAfter.rows[0]?.count).toBe(customersBefore.rows[0]?.count);
    const withCustomer = await createGuestFixture({ customer: true });
    await expect(post(withCustomer.rawToken)).resolves.toMatchObject({ status: 200 });
    expect((await effects(withCustomer.sessionId)).requested_by_customer_id).toBe(withCustomer.customerId);
  });

  it("keeps migration 21 requester consistency and active-request uniqueness enforced", async () => {
    const fixture = await createGuestFixture();
    await context.adminPool.query(
      `INSERT INTO retrieval_requests
       (id, organization_id, valet_session_id, requested_by_type, requested_by_customer_id, requested_by_membership_id, status, requested_at)
       VALUES ($1, $2, $3, 'CUSTOMER', NULL, NULL, 'CANCELLED', transaction_timestamp())`,
      [randomUUID(), fixture.organizationId, fixture.sessionId],
    );
    await expect(
      context.adminPool.query(
        `INSERT INTO retrieval_requests
         (id, organization_id, valet_session_id, requested_by_type, requested_by_customer_id, requested_by_membership_id, status, requested_at)
         VALUES ($1, $2, $3, 'CUSTOMER', NULL, $4, 'CANCELLED', transaction_timestamp())`,
        [randomUUID(), fixture.organizationId, fixture.sessionId, fixture.membershipId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await post(fixture.rawToken);
    await expect(
      context.adminPool.query(
        `INSERT INTO retrieval_requests
         (id, organization_id, valet_session_id, requested_by_type, requested_by_customer_id, requested_by_membership_id, status, requested_at)
         VALUES ($1, $2, $3, 'CUSTOMER', NULL, NULL, 'OPEN', transaction_timestamp())`,
        [randomUUID(), fixture.organizationId, fixture.sessionId],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects non-empty transport and fails closed for incoherent parked persistence", async () => {
    const fixture = await createGuestFixture();
    expect(await post(fixture.rawToken, { body: { sessionId: fixture.sessionId } })).toMatchObject({ body: { code: "REQUEST_INVALID" }, status: 400 });
    expect(await post(fixture.rawToken, { query: "?unexpected=true" })).toMatchObject({ body: { code: "REQUEST_INVALID" }, status: 400 });
    await context.adminPool.query(
      `INSERT INTO retrieval_requests
       (id, organization_id, valet_session_id, requested_by_type, requested_by_customer_id, requested_by_membership_id, status, requested_at)
       VALUES ($1, $2, $3, 'CUSTOMER', NULL, NULL, 'OPEN', transaction_timestamp())`,
      [randomUUID(), fixture.organizationId, fixture.sessionId],
    );
    expect(await post(fixture.rawToken)).toMatchObject({ body: { code: "INTERNAL_ERROR" }, status: 500 });
    expect((await effects(fixture.sessionId)).session_state).toBe("PARKED");
  });
});
