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
import { StaffOperationalContextController } from "../src/modules/staff/staff-operational-context.controller";
import { StaffOperationalContextService } from "../src/modules/staff/staff-operational-context.service";
import { ShiftTestContext } from "./shift-test-context";

export interface HttpResult {
  readonly body: Record<string, unknown>;
  readonly status: number;
}

export interface OperationalContextHarness {
  readonly baseUrl: () => string;
  readonly context: ShiftTestContext;
  readonly principals: Map<string, string>;
  close(): Promise<void>;
  start(): Promise<void>;
}

export function createOperationalContextHarness(): OperationalContextHarness {
  const context = new ShiftTestContext("operational-context");
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
    controllers: [StaffOperationalContextController],
    imports: [HttpInfrastructureModule],
    providers: [
      StaffOperationalContextService,
      {
        provide: RUNTIME_POSTGRES_POOL,
        useFactory: () => context.runtimePool,
      },
      { provide: STAFF_PRINCIPAL_RESOLVER, useValue: principalResolver },
    ],
  })
  class TestStaffModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
      consumer
        .apply(RequestIdMiddleware)
        .forRoutes(StaffOperationalContextController);
    }
  }

  let app: INestApplication;
  let url = "";

  return {
    baseUrl: () => url,
    context,
    principals,
    async close() {
      if (app !== undefined) await app.close();
      await context.teardown();
    },
    async start() {
      await context.setup();
      app = await NestFactory.create(TestStaffModule, { logger: false });
      await app.listen(0);
      const address = app.getHttpServer().address() as { port: number };
      url = `http://127.0.0.1:${String(address.port)}`;
    },
  };
}

export async function fetchContext(
  baseUrl: string,
  token?: string,
  extraHeaders?: Record<string, string>,
): Promise<HttpResult> {
  const headers: Record<string, string> = { ...extraHeaders };
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}/v1/staff/operational-context`, {
    headers,
  });
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = { raw: text };
  }
  return { body, status: response.status };
}

export function registerToken(
  principals: Map<string, string>,
  userId: string,
): string {
  const token = `token-${randomUUID()}`;
  principals.set(`Bearer ${token}`, userId);
  return token;
}

export async function insertActiveShift(
  harness: OperationalContextHarness,
  fixture: {
    locationId: string;
    membershipId: string;
    organizationId: string;
  },
  shiftId?: string,
): Promise<string> {
  const id = shiftId ?? randomUUID();
  await harness.context.adminPool.query(
    `INSERT INTO shifts (id, organization_id, location_id, membership_id, status, started_at)
     VALUES ($1, $2, $3, $4, 'ACTIVE', NOW())`,
    [id, fixture.organizationId, fixture.locationId, fixture.membershipId],
  );
  return id;
}

export async function fetchContextRawDuplicateAuth(
  baseUrl: string,
  token: string,
): Promise<HttpResult> {
  const url = new URL(`${baseUrl}/v1/staff/operational-context`);
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
        path: url.pathname,
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
}
