import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { RUNTIME_POSTGRES_POOL } from "../src/common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../src/common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../src/common/http/api-request";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  DatabaseStaffSessionContextResolver,
  DatabaseStaffPrincipalResolver,
} from "../src/modules/auth/staff-session-context";
import { STAFF_PRINCIPAL_RESOLVER } from "../src/modules/auth/staff-principal";
import { ShiftController } from "../src/modules/shifts/shift.controller";
import { ShiftService } from "../src/modules/shifts/shift.service";
import { ShiftPresenceController } from "../src/modules/shifts/shift-presence.controller";
import { ShiftPresenceService } from "../src/modules/shifts/shift-presence.service";
import { PresenceManagementService } from "../src/modules/management/presence-management.service";
import {
  PresenceCompanyController,
  PresenceCaPolicyController,
  PresenceCaZoneController,
  PresenceCaExceptionController,
} from "../src/modules/management/presence-management.controller";
import {
  PresenceLmPolicyController,
  PresenceLmZoneController,
  PresenceLmExceptionController,
} from "../src/modules/dashboard/dashboard-presence.controller";
import type { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { AntiAbuseService } from "../src/modules/anti-abuse/anti-abuse.service";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";

export async function presenceHttp(
  db: PresenceServerTestContext,
  pool = db.runtimePool,
) {
  const controllers = [
    ShiftController,
    ShiftPresenceController,
    PresenceCompanyController,
    PresenceCaPolicyController,
    PresenceCaZoneController,
    PresenceCaExceptionController,
    PresenceLmPolicyController,
    PresenceLmZoneController,
    PresenceLmExceptionController,
  ];
  @Module({
    controllers,
    imports: [HttpInfrastructureModule],
    providers: [
      ShiftService,
      ShiftPresenceService,
      PresenceManagementService,
      AntiAbuseService,
      AntiAbuseKeyDeriver,
      { provide: RUNTIME_POSTGRES_POOL, useFactory: () => pool },
      {
        provide: STAFF_SESSION_CONTEXT_RESOLVER,
        useFactory: () => new DatabaseStaffSessionContextResolver(pool),
      },
      {
        provide: STAFF_PRINCIPAL_RESOLVER,
        useFactory: () =>
          new DatabaseStaffPrincipalResolver(
            new DatabaseStaffSessionContextResolver(pool),
          ),
      },
    ],
  })
  class PresenceHttpModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
      consumer.apply(RequestIdMiddleware).forRoutes(...controllers);
    }
  }
  const app = await NestFactory.create(PresenceHttpModule, { logger: false });
  // Test-only loss happens after the service has committed, at HTTP serialization.
  app.use(
    (
      req: { headers: Record<string, string> },
      res: {
        json: (body: unknown) => unknown;
        socket: { destroy: () => void };
        end: (body: string) => void;
      },
      next: () => void,
    ) => {
      const loss = req.headers["x-test-response-loss"];
      if (loss === "DISCONNECT") res.json = () => res.socket.destroy();
      if (loss === "MALFORMED") res.json = () => res.end("{incomplete");
      next();
    },
  );
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  return {
    app,
    async request(
      method: string,
      path: string,
      token?: string,
      body?: unknown,
      loss?: string,
      extraHeaders: Record<string, string> = {},
    ) {
      const response = await fetch(`${url}${path}`, {
        method,
        headers: {
          ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...(loss === undefined ? {} : { "x-test-response-loss": loss }),
          ...extraHeaders,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: response.status,
        body: (await response.json()) as Record<string, unknown>,
        headers: response.headers,
      };
    },
  };
}
