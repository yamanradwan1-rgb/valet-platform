import { randomBytes, randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";

import {
  MiddlewareConsumer,
  Module,
  type INestApplication,
  type NestModule,
} from "@nestjs/common";
import { APP_FILTER, NestFactory } from "@nestjs/core";

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
import { GuestBrowserSessionService } from "../src/modules/guest-access/guest-browser-session.service";
import { GuestAuthOriginPolicy } from "../src/modules/guest-access/guest-browser-transport";
import { guestAdmissionProviders } from "./guest-request-admission-test-providers";
import { GuestRatingController } from "../src/modules/guest-access/guest-rating.controller";
import { GuestRatingService } from "../src/modules/guest-access/guest-rating.service";
import { hashGuestAccessToken } from "../src/modules/valet-sessions/guest-access-command";
import { CompleteHandoffTestContext } from "./complete-handoff-test-context";

interface HttpResult {
  readonly body: Record<string, unknown>;
  readonly headers: Headers;
  readonly status: number;
}

export class GuestRatingTestContext extends CompleteHandoffTestContext {
  private app?: INestApplication;
  private baseUrl = "";

  constructor(label: string) {
    super(`be09_${label}`);
  }

  override async setup(): Promise<void> {
    await super.setup();
    const runtimePool = this.runtimePool;
    @Module({
      controllers: [GuestRatingController],
      providers: [
        ApiOperationRunner,
        AntiAbuseKeyDeriver,
        AntiAbuseService,
        GuestAccessService,
        GuestBrowserSessionService,
        GuestAuthOriginPolicy,
        ...guestAdmissionProviders,
        GuestRatingService,
        TrustedClientAddressResolver,
        RequestIdMiddleware,
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: RUNTIME_POSTGRES_POOL, useValue: runtimePool },
        { provide: MONOTONIC_CLOCK, useValue: { now: () => 1 } },
        { provide: OPERATION_OBSERVER, useValue: { observe: () => undefined } },
      ],
    })
    class GuestRatingTestModule implements NestModule {
      configure(consumer: MiddlewareConsumer): void {
        consumer.apply(RequestIdMiddleware).forRoutes(GuestRatingController);
      }
    }
    this.app = await NestFactory.create(GuestRatingTestModule, {
      logger: false,
    });
    await this.app.listen(0, "127.0.0.1");
    this.baseUrl = await this.app.getUrl();
  }

  override async teardown(): Promise<void> {
    await this.app?.close();
    await super.teardown();
  }

  async attachGuestAccess(sessionId: string): Promise<string> {
    const rawToken = randomBytes(32).toString("base64url");
    await this.adminPool.query(
      `UPDATE valet_sessions
       SET customer_access_token_hash=$2,
           customer_access_expires_at=clock_timestamp()+interval '1 hour',
           customer_access_revoked_at=NULL
       WHERE id=$1`,
      [sessionId, hashGuestAccessToken(rawToken)],
    );
    return rawToken;
  }

  async completedFixture() {
    const fixture = await this.prepareStandard("PICKUP_CODE");
    await this.complete(fixture);
    return fixture;
  }

  async expire(sessionId: string): Promise<void> {
    await this.adminPool.query(
      `UPDATE valet_sessions SET customer_access_expires_at=clock_timestamp()-interval '1 second'
       WHERE id=$1`,
      [sessionId],
    );
  }

  async revoke(sessionId: string): Promise<void> {
    await this.adminPool.query(
      `UPDATE valet_sessions SET customer_access_revoked_at=clock_timestamp()
       WHERE id=$1`,
      [sessionId],
    );
  }

  async ratingRows(sessionId: string) {
    return (
      await this.adminPool.query<{
        rated_at: Date;
        rating: number;
        valet_session_id: string;
      }>(
        `SELECT valet_session_id::text,rating,rated_at
         FROM guest_ratings WHERE valet_session_id=$1`,
        [sessionId],
      )
    ).rows;
  }

  post(
    body: unknown,
    options: {
      readonly authorization?: string;
      readonly duplicateAuthorization?: string;
      readonly query?: string;
    } = {},
  ): Promise<HttpResult> {
    if (options.duplicateAuthorization === undefined) {
      return this.fetchPost(body, options.authorization, options.query);
    }
    return this.rawPost(
      body,
      options.authorization,
      options.duplicateAuthorization,
    );
  }

  private async fetchPost(
    body: unknown,
    authorization?: string,
    query?: string,
  ): Promise<HttpResult> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (authorization !== undefined) headers.authorization = authorization;
    const response = await fetch(
      `${this.baseUrl}/v1/guest/session/rating${query ?? ""}`,
      { body: JSON.stringify(body), headers, method: "POST" },
    );
    return {
      body: (await response.json()) as Record<string, unknown>,
      headers: response.headers,
      status: response.status,
    };
  }

  private rawPost(
    body: unknown,
    authorization: string | undefined,
    duplicateAuthorization: string,
  ): Promise<HttpResult> {
    const target = new URL(this.baseUrl);
    const payload = JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const request = httpRequest(
        {
          headers: [
            "Authorization",
            authorization ?? "",
            "Authorization",
            duplicateAuthorization,
            "Content-Type",
            "application/json",
            "Content-Length",
            String(Buffer.byteLength(payload)),
            "Host",
            target.host,
            "X-Request-Id",
            randomUUID(),
          ],
          host: target.hostname,
          method: "POST",
          path: "/v1/guest/session/rating",
          port: target.port,
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            const headers = new Headers();
            for (const [name, value] of Object.entries(response.headers)) {
              if (value !== undefined) {
                headers.set(
                  name,
                  Array.isArray(value) ? value.join(", ") : value,
                );
              }
            }
            resolve({
              body:
                text === ""
                  ? {}
                  : (JSON.parse(text) as Record<string, unknown>),
              headers,
              status: response.statusCode ?? 0,
            });
          });
        },
      );
      request.on("error", reject);
      request.end(payload);
    });
  }
}
