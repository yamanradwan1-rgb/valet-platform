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
import { GpsIngestionController } from "../src/modules/tracking/gps-ingestion.controller";
import { GpsIngestionService } from "../src/modules/tracking/gps-ingestion.service";
import { GpsIngestionTestContext } from "./gps-ingestion-test-context";

const context = new GpsIngestionTestContext("api");
const principals = new Map<string, string>();
const resolver: StaffPrincipalResolver = {
  async resolve(authorization) {
    const userId = authorization && principals.get(authorization);
    return userId === undefined
      ? new FailClosedStaffPrincipalResolver().resolve(authorization)
      : { userId };
  },
};

let app: INestApplication;
let baseUrl: string;

@Module({
  controllers: [GpsIngestionController],
  imports: [HttpInfrastructureModule],
  providers: [
    GpsIngestionService,
    { provide: RUNTIME_POSTGRES_POOL, useFactory: () => context.runtimePool },
    { provide: STAFF_PRINCIPAL_RESOLVER, useValue: resolver },
  ],
})
class TestGpsIngestionModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes(GpsIngestionController);
  }
}

async function post(sessionId: string, body: unknown, token?: string) {
  const response = await fetch(
    `${baseUrl}/v1/staff/valet-sessions/${sessionId}/tracking/gps-samples`,
    {
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
      method: "POST",
    },
  );
  return {
    body: (await response.json()) as Record<string, unknown>,
    requestId: response.headers.get("x-request-id"),
    status: response.status,
  };
}

beforeAll(async () => {
  await context.setup();
  app = await NestFactory.create(TestGpsIngestionModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
}, 120_000);

afterAll(async () => {
  await app?.close();
  await context.teardown();
}, 120_000);

describe("VAL-007D GPS ingestion API", () => {
  it("requires staff bearer auth and returns only sample identity/status", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const sample = await context.sample();
    expect((await post(fixture.sessionId, { samples: [sample] })).status).toBe(
      401,
    );
    const token = randomUUID();
    principals.set(`Bearer ${token}`, fixture.userId);
    const response = await post(
      fixture.sessionId,
      { samples: [sample] },
      token,
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      samples: [{ clientSampleId: sample.clientSampleId, status: "ACCEPTED" }],
    });
    expect(response.requestId).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
    expect(JSON.stringify(response.body)).not.toMatch(
      /latitude|longitude|accuracy|capturedAt|taskId|trackingSessionId|membership/i,
    );
  });

  it("rejects unknown keys, timezone-less timestamps, and oversized batches", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const token = randomUUID();
    principals.set(`Bearer ${token}`, fixture.userId);
    const sample = await context.sample();
    for (const body of [
      { samples: [{ ...sample, taskId: randomUUID() }] },
      { samples: [{ ...sample, capturedAt: "2026-08-15T10:00:00" }] },
      { samples: [] },
      { samples: Array.from({ length: 51 }, () => sample) },
    ]) {
      expect((await post(fixture.sessionId, body, token)).status).toBe(400);
    }
    expect(await context.rawSamples(fixture)).toHaveLength(0);
  });
});
