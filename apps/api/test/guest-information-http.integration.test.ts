import {
  MiddlewareConsumer,
  Module,
  type INestApplication,
  type NestModule,
} from "@nestjs/common";
import { APP_FILTER, NestFactory } from "@nestjs/core";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { ApiExceptionFilter } from "../src/common/http/api-exception.filter";
import { ApiOperationRunner } from "../src/common/http/api-operation-runner";
import { RequestIdMiddleware } from "../src/common/http/api-request";
import {
  MONOTONIC_CLOCK,
  OPERATION_OBSERVER,
} from "../src/common/observability/operation-observability";
import { AntiAbuseService } from "../src/modules/anti-abuse/anti-abuse.service";
import { GuestAccessService } from "../src/modules/guest-access/guest-access.service";
import { GuestInformationController } from "../src/modules/guest-access/guest-information.controller";
import { GuestInformationService } from "../src/modules/guest-access/guest-information.service";
import { GuestInformationScopeUnavailableError } from "../src/modules/management/guest-information-public-projection";
import { GuestAccessError } from "../src/modules/valet-sessions/guest-access-command";
import {
  guestAdmissionQueryStub,
  guestAuthorizerTestProviders,
} from "./guest-authorizer-test-providers";

const sessionId = "00000000-0000-4000-8000-000000000201";
const guestBearer = "A".repeat(43);
const browserSecret = `vgb1.${"B".repeat(43)}`;
const browserCookie = `__Host-vaylet_guest_browser=${browserSecret}`;
const calls = vi.fn();
let valid = true;
let locationActive = true;

const antiAbuse = {
  blocker: async () => undefined,
  count: async () => ({ allowed: true as const }),
  finalize: async () => undefined,
  key: () => ({ keyHash: "test", lockHigh: 1, lockLow: 2, scope: "test" }),
  async reserve() {
    return {
      allowed: true as const,
      reservation: { id: "reservation", key: { keyHash: "test" } },
    };
  },
  async transaction<T>(action: (transaction: unknown) => Promise<T>) {
    return action(guestAdmissionQueryStub(() => antiAbuse.reserve()));
  },
};
const guestAccess = {
  async resolveCredentialInTransaction() {
    if (!valid) return undefined;
    return {
      scope: "ACTIVE" as const,
      session: { valetSessionId: sessionId },
    };
  },
};
const published = {
  locale: "en" as const,
  privacy: {
    status: "PUBLISHED" as const,
    text: "Approved published privacy policy",
    url: null,
    version: 2,
    publishedAt: "2026-10-22T16:00:00.000Z",
  },
  contact: {
    displayName: "Reception",
    phone: "+962700000002",
    supportUrl: null,
    hours: "09:00-17:00",
  },
};
const unavailable = {
  locale: "ar" as const,
  privacy: {
    status: "UNAVAILABLE" as const,
    text: null,
    url: null,
    version: null,
    publishedAt: null,
  },
  contact: published.contact,
};
const guestInformation = {
  async read(reservation: unknown, credential: unknown, locale: "en" | "ar") {
    calls(reservation, credential, locale);
    // The real service locks and resolves the credential again after admission.
    if (!valid) throw new GuestAccessError("GUEST_ACCESS_INVALID");
    if (!locationActive) throw new GuestInformationScopeUnavailableError();
    return locale === "en" ? published : unavailable;
  },
};

@Module({
  controllers: [GuestInformationController],
  providers: [
    ApiOperationRunner,
    RequestIdMiddleware,
    ...guestAuthorizerTestProviders,
    { provide: GuestAccessService, useValue: guestAccess },
    { provide: GuestInformationService, useValue: guestInformation },
    { provide: AntiAbuseService, useValue: antiAbuse },
    { provide: MONOTONIC_CLOCK, useValue: { now: () => 1 } },
    { provide: OPERATION_OBSERVER, useValue: { observe: () => undefined } },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
class GuestInformationTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes(GuestInformationController);
  }
}

let app: INestApplication;
let baseUrl: string;

async function get(query: string, headers: Record<string, string> = {}) {
  const response = await fetch(`${baseUrl}/v1/guest/information${query}`, {
    headers,
  });
  return {
    body: (await response.json()) as Record<string, unknown>,
    headers: response.headers,
    status: response.status,
  };
}

function noStore(headers: Headers): void {
  expect(headers.get("cache-control")).toBe("no-store");
  expect(headers.get("pragma")).toBe("no-cache");
}

beforeAll(async () => {
  app = await NestFactory.create(GuestInformationTestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  baseUrl = await app.getUrl();
});
beforeEach(() => {
  valid = true;
  locationActive = true;
  calls.mockReset();
});
afterAll(async () => app.close());

describe("Guest #316 published information HTTP boundary", () => {
  it("returns only the published projection for a valid bearer", async () => {
    const result = await get("?locale=en", {
      authorization: `Bearer ${guestBearer}`,
    });
    expect(result).toMatchObject({ body: published, status: 200 });
    expect(result.body).not.toHaveProperty("organizationId");
    expect(result.body).not.toHaveProperty("locationId");
    expect(result.body).not.toHaveProperty("draft");
    noStore(result.headers);
    expect(calls).toHaveBeenCalledOnce();
    expect(calls.mock.calls[0]?.[1]).toEqual({
      kind: "LEGACY_BEARER",
      secret: guestBearer,
    });
  });

  it("accepts a valid Guest Browser Session cookie", async () => {
    const result = await get("?locale=en", { cookie: browserCookie });
    expect(result).toMatchObject({ body: published, status: 200 });
    noStore(result.headers);
    expect(calls.mock.calls[0]?.[1]).toEqual({
      kind: "BROWSER_SESSION",
      secret: browserSecret,
    });
  });

  it("leaves an unavailable locale empty instead of falling back to English", async () => {
    const result = await get("?locale=ar", { cookie: browserCookie });
    expect(result).toMatchObject({ body: unavailable, status: 200 });
    noStore(result.headers);
  });

  it.each([
    "",
    "?locale=",
    "?locale=fr",
    "?locale=EN",
    "?locale=en&locale=ar",
    "?locale=en&locationId=other",
    "?locale=en&organizationId=other",
  ])("rejects unexpected query parameters: %s", async (query) => {
    const result = await get(query, {
      authorization: `Bearer ${guestBearer}`,
    });
    expect(result).toMatchObject({
      body: { code: "REQUEST_INVALID" },
      status: 400,
    });
    noStore(result.headers);
    expect(calls).not.toHaveBeenCalled();
  });

  it("rejects missing and ambiguous Guest credentials before the projection", async () => {
    const missing = await get("?locale=en");
    const ambiguous = await get("?locale=en", {
      authorization: `Bearer ${guestBearer}`,
      cookie: browserCookie,
    });
    for (const result of [missing, ambiguous]) {
      expect(result).toMatchObject({
        body: { code: "GUEST_ACCESS_INVALID" },
        status: 401,
      });
      noStore(result.headers);
    }
    expect(calls).not.toHaveBeenCalled();
  });

  it("rejects a revoked credential after the service rechecks it", async () => {
    valid = false;
    const revoked = await get("?locale=en", {
      authorization: `Bearer ${guestBearer}`,
    });
    expect(revoked).toMatchObject({
      body: { code: "GUEST_ACCESS_INVALID" },
      status: 401,
    });
    noStore(revoked.headers);
    expect(calls).toHaveBeenCalledOnce();
  });

  it("returns a concealed 401 when a validated Guest's Location became inactive", async () => {
    locationActive = false;
    const result = await get("?locale=en", {
      authorization: `Bearer ${guestBearer}`,
    });
    expect(result).toMatchObject({
      body: { code: "GUEST_ACCESS_INVALID" },
      status: 401,
    });
    expect(JSON.stringify(result.body)).not.toContain("Location");
    noStore(result.headers);
  });
});
