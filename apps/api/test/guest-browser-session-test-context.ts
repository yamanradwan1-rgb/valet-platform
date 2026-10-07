import { randomBytes } from "node:crypto";

import {
  MiddlewareConsumer,
  Module,
  type INestApplication,
  type NestModule,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { RUNTIME_POSTGRES_POOL } from "../src/common/database/runtime-database.module";
import { RequestIdMiddleware } from "../src/common/http/api-request";
import { HttpInfrastructureModule } from "../src/common/http/http-infrastructure.module";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { AntiAbuseService } from "../src/modules/anti-abuse/anti-abuse.service";
import { TrustedClientAddressResolver } from "../src/modules/anti-abuse/client-address";
import { GuestAccessController } from "../src/modules/guest-access/guest-access.controller";
import { GuestAccessService } from "../src/modules/guest-access/guest-access.service";
import { GuestBrowserSessionController } from "../src/modules/guest-access/guest-browser-session.controller";
import { GuestBrowserSessionService } from "../src/modules/guest-access/guest-browser-session.service";
import {
  GUEST_BROWSER_COOKIE,
  GUEST_ENROLLMENT_COOKIE,
  GuestAuthOriginPolicy,
} from "../src/modules/guest-access/guest-browser-transport";
import { GuestCredentialAuthorizer } from "../src/modules/guest-access/guest-credential-authorizer";
import {
  createIssueGuestAccessCommandExecutor,
  createRevokeGuestAccessCommandExecutor,
} from "../src/modules/valet-sessions/guest-access-command";
import {
  createSessionHelper,
  createVehicleHelper,
} from "./staff-valet-session-fixture-helpers";
import { ShiftTestContext, type ShiftFixture } from "./shift-test-context";

export const guestOrigin = "https://customer.example.test";
export const mutationHeaders = {
  "content-type": "application/json",
  origin: guestOrigin,
  "x-vaylet-guest-session": "v1",
} as const;

export interface GuestVisit {
  readonly fixture: ShiftFixture;
  readonly sessionId: string;
  readonly token: string;
}

export interface BrowserCredentials {
  readonly browser: string;
  readonly enrollment: string;
}

function secret(prefix: "vge1." | "vgb1."): string {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

export function cookieHeader(values: readonly string[]): string {
  return values.join("; ");
}

export function cookieValue(
  headers: Headers,
  name: string,
): string | undefined {
  const raw = headers.get("set-cookie") ?? "";
  const match = new RegExp(`(?:^|,\\s*)${name}=([^;]*)`).exec(raw);
  return match?.[1];
}

export class GuestBrowserSessionTestContext extends ShiftTestContext {
  private app?: INestApplication;
  private baseUrl = "";
  private readonly priorEnvironment = {
    antiAbuseSecret: process.env.ANTI_ABUSE_HMAC_SECRET_B64URL,
    enrollmentEnabled: process.env.GUEST_BROWSER_SESSION_ENROLLMENT_ENABLED,
    guestOrigins: process.env.GUEST_AUTH_ALLOWED_ORIGINS,
  };

  constructor(label: string) {
    super(`guest_browser_${label}`);
  }

  override async setup(): Promise<void> {
    await super.setup();
    process.env.GUEST_BROWSER_SESSION_ENROLLMENT_ENABLED = "true";
    process.env.GUEST_AUTH_ALLOWED_ORIGINS = guestOrigin;
    process.env.ANTI_ABUSE_HMAC_SECRET_B64URL =
      randomBytes(32).toString("base64url");
    const runtimePool = this.runtimePool;

    @Module({
      controllers: [GuestAccessController, GuestBrowserSessionController],
      imports: [HttpInfrastructureModule],
      providers: [
        AntiAbuseKeyDeriver,
        AntiAbuseService,
        GuestAccessService,
        GuestAuthOriginPolicy,
        GuestBrowserSessionService,
        GuestCredentialAuthorizer,
        TrustedClientAddressResolver,
        { provide: RUNTIME_POSTGRES_POOL, useValue: runtimePool },
      ],
    })
    class GuestBrowserTestModule implements NestModule {
      configure(consumer: MiddlewareConsumer): void {
        consumer
          .apply(RequestIdMiddleware)
          .forRoutes(GuestAccessController, GuestBrowserSessionController);
      }
    }

    this.app = await NestFactory.create(GuestBrowserTestModule, {
      logger: false,
    });
    await this.app.listen(0, "127.0.0.1");
    this.baseUrl = await this.app.getUrl();
  }

  override async teardown(): Promise<void> {
    await this.app?.close();
    await super.teardown();
    this.restoreEnvironment(
      "ANTI_ABUSE_HMAC_SECRET_B64URL",
      this.priorEnvironment.antiAbuseSecret,
    );
    this.restoreEnvironment(
      "GUEST_BROWSER_SESSION_ENROLLMENT_ENABLED",
      this.priorEnvironment.enrollmentEnabled,
    );
    this.restoreEnvironment(
      "GUEST_AUTH_ALLOWED_ORIGINS",
      this.priorEnvironment.guestOrigins,
    );
  }

  async createVisit(state = "PARKED"): Promise<GuestVisit> {
    const fixture = await this.createFixture();
    const vehicleId = await createVehicleHelper(this, fixture, {
      color: "Black",
      make: "Toyota",
      model: "Camry",
      temporaryDescriptor: "Guest browser test",
    });
    const sessionId = await createSessionHelper(this, fixture, vehicleId, {
      state,
    });
    const issued = await createIssueGuestAccessCommandExecutor(
      this.runtimePool,
    )({
      authenticatedUserId: fixture.userId,
      intent: "ISSUE_OR_ROTATE",
      valetSessionId: sessionId,
    });
    return { fixture, sessionId, token: issued.rawToken };
  }

  async complete(sessionId: string, ageHours = 0): Promise<void> {
    await this.adminPool.query(
      `UPDATE valet_sessions
       SET state='COMPLETED',
           completed_at=clock_timestamp()-($2::text || ' hours')::interval,
           updated_at=clock_timestamp()
       WHERE id=$1`,
      [sessionId, ageHours],
    );
  }

  async cancel(sessionId: string): Promise<void> {
    await this.adminPool.query(
      `UPDATE valet_sessions SET state='CANCELLED', updated_at=clock_timestamp()
       WHERE id=$1`,
      [sessionId],
    );
  }

  async enrollDirect(): Promise<BrowserCredentials> {
    const credentials = {
      browser: secret("vgb1."),
      enrollment: secret("vge1."),
    };
    const result = await this.runtimePool.query<{ result_code: string }>(
      "SELECT result_code FROM public.guest_browser_enroll($1,$2)",
      [credentials.enrollment, credentials.browser],
    );
    if (result.rows[0]?.result_code !== "OK")
      throw new Error("Enrollment failed.");
    return credentials;
  }

  async exchangeDirect(
    token: string,
    credentials: BrowserCredentials,
  ): Promise<string> {
    const result = await this.runtimePool.query<{ result_code: string }>(
      "SELECT result_code FROM public.guest_browser_exchange($1,$2,$3)",
      [token, credentials.enrollment, credentials.browser],
    );
    return result.rows[0]?.result_code ?? "MISSING";
  }

  async resolveDirect(browser: string, allowPostVisit = true): Promise<string> {
    const result = await this.runtimePool.query<{
      authority_scope: string | null;
      result_code: string;
    }>(
      "SELECT result_code, authority_scope FROM public.guest_browser_resolve($1,$2)",
      [browser, allowPostVisit],
    );
    const row = result.rows[0];
    return row?.result_code === "OK"
      ? `OK:${row.authority_scope}`
      : (row?.result_code ?? "MISSING");
  }

  async endDirect(browser: string): Promise<void> {
    await this.runtimePool.query("SELECT public.guest_browser_end($1)", [
      browser,
    ]);
  }

  async rotate(visit: GuestVisit): Promise<string> {
    return (
      await createIssueGuestAccessCommandExecutor(this.runtimePool)({
        authenticatedUserId: visit.fixture.userId,
        intent: "ISSUE_OR_ROTATE",
        valetSessionId: visit.sessionId,
      })
    ).rawToken;
  }

  async revoke(visit: GuestVisit): Promise<Date> {
    return (
      await createRevokeGuestAccessCommandExecutor(this.runtimePool)({
        authenticatedUserId: visit.fixture.userId,
        valetSessionId: visit.sessionId,
      })
    ).revokedAt;
  }

  async reissue(visit: GuestVisit, revokedAt: Date): Promise<string> {
    return (
      await createIssueGuestAccessCommandExecutor(this.runtimePool)({
        authenticatedUserId: visit.fixture.userId,
        expectedRevokedAt: revokedAt,
        intent: "REISSUE_REVOKED",
        valetSessionId: visit.sessionId,
      })
    ).rawToken;
  }

  async request(
    method: string,
    path: string,
    options: {
      readonly authorization?: string;
      readonly body?: unknown;
      readonly cookies?: readonly string[];
      readonly headers?: Record<string, string>;
    } = {},
  ) {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (options.authorization !== undefined)
      headers.authorization = options.authorization;
    if (options.cookies !== undefined)
      headers.cookie = cookieHeader(options.cookies);
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
    const text = await response.text();
    return {
      body: text === "" ? {} : (JSON.parse(text) as Record<string, unknown>),
      headers: response.headers,
      status: response.status,
    };
  }

  browserCookie(value: string): string {
    return `${GUEST_BROWSER_COOKIE}=${value}`;
  }

  enrollmentCookie(value: string): string {
    return `${GUEST_ENROLLMENT_COOKIE}=${value}`;
  }

  private restoreEnvironment(name: string, value: string | undefined): void {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
