import { randomUUID } from "node:crypto";

import {
  MiddlewareConsumer,
  Module,
  type INestApplication,
  type NestModule,
} from "@nestjs/common";
import { APP_FILTER, NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppController } from "../src/app.controller";
import { ApiExceptionFilter } from "../src/common/http/api-exception.filter";
import { ApiOperationRunner } from "../src/common/http/api-operation-runner";
import { RequestIdMiddleware } from "../src/common/http/api-request";
import {
  MONOTONIC_CLOCK,
  OPERATION_OBSERVER,
} from "../src/common/observability/operation-observability";
import {
  AntiAbuseService,
  AntiAbuseUnavailableError,
} from "../src/modules/anti-abuse/anti-abuse.service";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../src/modules/auth/staff-principal";
import {
  GuestAccessController,
  StaffGuestAccessController,
} from "../src/modules/guest-access/guest-access.controller";
import { GuestAccessService } from "../src/modules/guest-access/guest-access.service";
import { guestAuthorizerTestProviders } from "./guest-authorizer-test-providers";

const sessionId = randomUUID();
const rawToken = "A".repeat(43);
const now = new Date("2026-08-12T12:00:00.000Z");
let antiAbuseMode: "ALLOW" | "RATE_LIMIT" | "UNAVAILABLE" = "ALLOW";
let guestMode: "ACTIVE" | "INVALID" | "UNEXPECTED" = "ACTIVE";
let revoked = false;

const service = {
  async executeIssue() {
    return {
      expiresAt: new Date("2026-08-13T12:00:00.000Z"),
      issuedAt: now,
      mutationKind: "ISSUED" as const,
      rawToken,
      valetSessionId: sessionId,
    };
  },
  async executeRevoke() {
    revoked = true;
    return { revokedAt: now, valetSessionId: sessionId };
  },
  async resolveCredentialInTransaction() {
    if (guestMode === "UNEXPECTED") throw new Error("test failure");
    if (guestMode === "INVALID" || revoked) return undefined;
    const session = {
      branding: { displayName: "Guest Safe", primaryColor: "#176BFF" },
      guestVehicleReadyNotificationEnabled: true,
      readyAt: null,
      state: "PARKED" as const,
      valetSessionId: sessionId,
      vehicle: { color: "Black", make: "Toyota", model: "Camry" },
    };
    return { scope: "ACTIVE" as const, session };
  },
};

const antiAbuse = {
  blocker: async () => undefined,
  count: async () => ({ allowed: true as const }),
  finalize: async () => undefined,
  finalizeInTransaction: async () => undefined,
  key: () => ({ keyHash: "test", lockHigh: 1, lockLow: 2, scope: "test" }),
  async reserve() {
    if (antiAbuseMode === "UNAVAILABLE") {
      throw new AntiAbuseUnavailableError();
    }
    if (antiAbuseMode === "RATE_LIMIT") {
      return { allowed: false as const, retryAfter: 30 };
    }
    return {
      allowed: true as const,
      reservation: {
        id: "reservation",
        key: { keyHash: "test", lockHigh: 1, lockLow: 2, scope: "test" },
      },
    };
  },
  async transaction<T>(action: (transaction: unknown) => Promise<T>) {
    return await action({});
  },
};

const principal: StaffPrincipalResolver = {
  async resolve(authorization) {
    if (authorization !== "Bearer staff") throw new Error("unauthorized");
    return { userId: randomUUID() };
  },
};

@Module({
  controllers: [
    AppController,
    StaffGuestAccessController,
    GuestAccessController,
  ],
  providers: [
    ApiOperationRunner,
    RequestIdMiddleware,
    { provide: GuestAccessService, useValue: service },
    ...guestAuthorizerTestProviders,
    { provide: AntiAbuseService, useValue: antiAbuse },
    { provide: STAFF_PRINCIPAL_RESOLVER, useValue: principal },
    { provide: MONOTONIC_CLOCK, useValue: { now: () => 1 } },
    { provide: OPERATION_OBSERVER, useValue: { observe: () => undefined } },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
class TestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(StaffGuestAccessController, GuestAccessController);
  }
}

let app: INestApplication;
let baseUrl: string;

async function request(
  method: string,
  path: string,
  options: { authorization?: string; body?: unknown } = {},
): Promise<{
  body: Record<string, unknown>;
  headers: Headers;
  status: number;
}> {
  const headers: Record<string, string> = {};
  if (options.authorization !== undefined) {
    headers.authorization = options.authorization;
  }
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  return {
    body: (await response.json()) as Record<string, unknown>,
    headers: response.headers,
    status: response.status,
  };
}

function expectNoStore(result: { headers: Headers }): void {
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(result.headers.get("pragma")).toBe("no-cache");
}

beforeAll(async () => {
  app = await NestFactory.create(TestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  baseUrl = await app.getUrl();
});

beforeEach(() => {
  antiAbuseMode = "ALLOW";
  guestMode = "ACTIVE";
  revoked = false;
});

afterAll(async () => {
  await app.close();
});

describe("SEC-003 guest response cache prevention", () => {
  it("protects successful issue, guest read, and revoke responses", async () => {
    const issue = await request(
      "POST",
      `/v1/staff/check-in/sessions/${sessionId}/guest-access/issue`,
      { authorization: "Bearer staff", body: { intent: "ISSUE_OR_ROTATE" } },
    );
    expect(issue).toMatchObject({ body: { rawToken }, status: 200 });
    expectNoStore(issue);

    const guest = await request("GET", "/v1/guest/session", {
      authorization: `Bearer ${rawToken}`,
    });
    expect(guest).toMatchObject({
      body: { valetSessionId: sessionId },
      status: 200,
    });
    expectNoStore(guest);

    const revoke = await request(
      "POST",
      `/v1/staff/check-in/sessions/${sessionId}/guest-access/revoke`,
      { authorization: "Bearer staff", body: {} },
    );
    expect(revoke.status).toBe(200);
    expectNoStore(revoke);
  });

  it("protects missing, malformed, invalid, and revoked bearer errors", async () => {
    const missing = await request("GET", "/v1/guest/session");
    const malformed = await request("GET", "/v1/guest/session", {
      authorization: "Bearer malformed",
    });
    guestMode = "INVALID";
    const invalid = await request("GET", "/v1/guest/session", {
      authorization: `Bearer ${rawToken}`,
    });
    guestMode = "ACTIVE";
    revoked = true;
    const revokedResult = await request("GET", "/v1/guest/session", {
      authorization: `Bearer ${rawToken}`,
    });
    for (const result of [missing, malformed, invalid, revokedResult]) {
      expect(result).toMatchObject({
        body: { code: "GUEST_ACCESS_INVALID" },
        status: 401,
      });
      expectNoStore(result);
    }
  });

  it("protects guest rate-limit, unavailable, transport, and unexpected errors", async () => {
    antiAbuseMode = "RATE_LIMIT";
    const limited = await request("GET", "/v1/guest/session");
    expect(limited).toMatchObject({
      body: { code: "GUEST_ACCESS_RATE_LIMITED" },
      status: 429,
    });
    expectNoStore(limited);

    antiAbuseMode = "UNAVAILABLE";
    const unavailable = await request("GET", "/v1/guest/session");
    expect(unavailable).toMatchObject({
      body: { code: "ANTI_ABUSE_UNAVAILABLE" },
      status: 503,
    });
    expectNoStore(unavailable);

    antiAbuseMode = "ALLOW";
    const transport = await request("GET", "/v1/guest/session?unexpected=true");
    expect(transport).toMatchObject({
      body: { code: "REQUEST_INVALID" },
      status: 400,
    });
    expectNoStore(transport);

    guestMode = "UNEXPECTED";
    const unexpected = await request("GET", "/v1/guest/session", {
      authorization: `Bearer ${rawToken}`,
    });
    expect(unexpected).toMatchObject({
      body: { code: "INTERNAL_ERROR" },
      status: 500,
    });
    expectNoStore(unexpected);
  });

  it("protects staff guest-access errors without changing unrelated routes", async () => {
    const issueError = await request(
      "POST",
      `/v1/staff/check-in/sessions/${sessionId}/guest-access/issue`,
      { authorization: "Bearer staff", body: { intent: "INVALID" } },
    );
    expect(issueError).toMatchObject({
      body: { code: "REQUEST_INVALID" },
      status: 400,
    });
    expectNoStore(issueError);

    const revokeError = await request(
      "POST",
      `/v1/staff/check-in/sessions/${sessionId}/guest-access/revoke`,
      { authorization: "Bearer staff", body: { unexpected: true } },
    );
    expect(revokeError).toMatchObject({
      body: { code: "REQUEST_INVALID" },
      status: 400,
    });
    expectNoStore(revokeError);

    const unrelated = await request("GET", "/");
    expect(unrelated.status).toBe(200);
    expect(unrelated.headers.get("cache-control")).toBeNull();
    expect(unrelated.headers.get("pragma")).toBeNull();
  });
});
