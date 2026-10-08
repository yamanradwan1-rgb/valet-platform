import { GuestBrowserLimiter } from "../src/modules/guest-access/guest-browser-limiter";
import { GuestRequestAdmission } from "../src/modules/guest-access/guest-request-admission";
import {
  MiddlewareConsumer,
  Module,
  type INestApplication,
  type NestModule,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import type { PostgresPool } from "../src/common/database/postgres";
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
import { GuestAuthOriginPolicy } from "../src/modules/guest-access/guest-browser-transport";
import { GuestCredentialAuthorizer } from "../src/modules/guest-access/guest-credential-authorizer";

export interface GuestBrowserPeerApp {
  readonly app: INestApplication;
  readonly baseUrl: string;
}

export async function startGuestBrowserPeerApp(
  runtimePool: PostgresPool,
): Promise<GuestBrowserPeerApp> {
  @Module({
    controllers: [GuestAccessController, GuestBrowserSessionController],
    imports: [HttpInfrastructureModule],
    providers: [
      GuestBrowserLimiter,
      GuestRequestAdmission,
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
  class GuestBrowserPeerModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
      consumer
        .apply(RequestIdMiddleware)
        .forRoutes(GuestAccessController, GuestBrowserSessionController);
    }
  }

  const app = await NestFactory.create(GuestBrowserPeerModule, {
    logger: false,
  });
  await app.listen(0, "127.0.0.1");
  return { app, baseUrl: await app.getUrl() };
}
