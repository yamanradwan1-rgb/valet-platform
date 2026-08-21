import { randomUUID } from "node:crypto";

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
import {
  FailClosedStaffPrincipalResolver,
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../src/modules/auth/staff-principal";
import { DispatchController } from "../src/modules/dispatch/dispatch.controller";
import { DispatchService } from "../src/modules/dispatch/dispatch.service";
import {
  DispatchTestContext,
  type DispatchFixture,
} from "./dispatch-test-context";

export interface StaffTaskQueueHarness {
  readonly baseUrl: () => string;
  readonly context: DispatchTestContext;
  readonly principals: Map<string, string>;
  close(): Promise<void>;
  createSameOrgLocation(fixture: DispatchFixture): Promise<string>;
  fixtureWithToken(role?: "VALET_EMPLOYEE" | "VALET_SUPERVISOR"): Promise<{
    fixture: DispatchFixture;
    token: string;
  }>;
  rawDuplicateAuthRequest(
    locationId: string,
    token: string,
  ): Promise<{ body: Record<string, unknown>; status: number }>;
  request(
    method: string,
    path: string,
    options?: { readonly body?: unknown; readonly token?: string },
  ): Promise<{ body: Record<string, unknown>; status: number }>;
  resetPrincipals(): void;
  start(): Promise<void>;
}

export function createStaffTaskQueueHarness(): StaffTaskQueueHarness {
  const context = new DispatchTestContext("queue_proj");
  const principals = new Map<string, string>();
  const principalResolver: StaffPrincipalResolver = {
    async resolve(authorization) {
      const userId =
        authorization === undefined ? undefined : principals.get(authorization);
      return userId === undefined
        ? new FailClosedStaffPrincipalResolver().resolve(authorization)
        : { userId };
    },
  };

  @Module({
    controllers: [DispatchController],
    imports: [HttpInfrastructureModule],
    providers: [
      DispatchService,
      {
        provide: RUNTIME_POSTGRES_POOL,
        useFactory: () => context.runtimePool,
      },
      {
        provide: STAFF_PRINCIPAL_RESOLVER,
        useValue: principalResolver,
      },
    ],
  })
  class TestDispatchQueueModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
      consumer.apply(RequestIdMiddleware).forRoutes(DispatchController);
    }
  }

  let app: INestApplication;
  let baseUrl = "";

  return {
    baseUrl: () => baseUrl,
    context,
    principals,
    async close() {
      if (app !== undefined) await app.close();
      await context.teardown();
    },
    async createSameOrgLocation(fixture: DispatchFixture) {
      const locationId = randomUUID();
      await context.adminPool.query(
        `INSERT INTO locations
           (id, organization_id, name, code, address_text, timezone, currency,
            status, updated_at)
         VALUES ($1, $2, 'Location Same Org 2', $3, 'Address', 'Asia/Amman',
                 'JOD', 'ACTIVE', clock_timestamp())`,
        [locationId, fixture.organizationId, `loc-${randomUUID().slice(0, 8)}`],
      );
      return locationId;
    },
    async fixtureWithToken(
      role: "VALET_EMPLOYEE" | "VALET_SUPERVISOR" = "VALET_EMPLOYEE",
    ) {
      const fixture = await context.createDispatchFixture({ role });
      const token = `queue-${randomUUID()}`;
      principals.set(`Bearer ${token}`, fixture.userId);
      return { fixture, token };
    },
    async rawDuplicateAuthRequest(locationId: string, token: string) {
      const url = new URL(
        `${baseUrl}/v1/staff/tasks/queue?locationId=${locationId}`,
      );
      const { request: httpRequest } = await import("node:http");
      return new Promise((resolve, reject) => {
        const req = httpRequest(
          {
            headers: [
              "Authorization",
              `Bearer ${token}`,
              "Authorization",
              `Bearer ${token}`,
            ] as unknown as Record<string, string>,
            hostname: url.hostname,
            method: "GET",
            path: `${url.pathname}${url.search}`,
            port: Number(url.port),
          },
          (r) => {
            let data = "";
            r.on("data", (chunk: Buffer | string) => {
              data += chunk.toString();
            });
            r.on("end", () => {
              let body: Record<string, unknown> = {};
              try {
                body = JSON.parse(data) as Record<string, unknown>;
              } catch {
                body = { raw: data };
              }
              resolve({ body, status: r.statusCode ?? 0 });
            });
          },
        );
        req.on("error", reject);
        req.end();
      });
    },
    async request(
      method: string,
      path: string,
      options: { readonly body?: unknown; readonly token?: string } = {},
    ) {
      const headers: Record<string, string> = {};
      if (options.token !== undefined) {
        headers.authorization = `Bearer ${options.token}`;
      }
      if (options.body !== undefined) {
        headers["content-type"] = "application/json";
      }
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
      });
      return {
        body: (await response.json()) as Record<string, unknown>,
        status: response.status,
      };
    },
    resetPrincipals() {
      principals.clear();
    },
    async start() {
      await context.setup();
      app = await NestFactory.create(TestDispatchQueueModule, {
        logger: false,
      });
      await app.listen(0, "127.0.0.1");
      const address = app.getHttpServer().address() as { port: number };
      baseUrl = `http://127.0.0.1:${String(address.port)}`;
    },
  };
}
