import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";

import type { PostgresPool } from "../src/common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../src/common/database/runtime-database.module";
import { RequestIdMiddleware } from "../src/common/http/api-request";
import { HttpInfrastructureModule } from "../src/common/http/http-infrastructure.module";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { AntiAbuseService } from "../src/modules/anti-abuse/anti-abuse.service";
import { TrustedClientAddressResolver } from "../src/modules/anti-abuse/client-address";
import { GuestAccessController } from "../src/modules/guest-access/guest-access.controller";
import { GuestAccessService } from "../src/modules/guest-access/guest-access.service";
import { GuestBrowserContextController } from "../src/modules/guest-access/guest-browser-context.controller";
import { GuestBrowserContextService } from "../src/modules/guest-access/guest-browser-context.service";
import { GuestBrowserLimiter } from "../src/modules/guest-access/guest-browser-limiter";
import { GuestBrowserSessionController } from "../src/modules/guest-access/guest-browser-session.controller";
import { GuestBrowserSessionService } from "../src/modules/guest-access/guest-browser-session.service";
import { GuestAuthOriginPolicy } from "../src/modules/guest-access/guest-browser-transport";
import { GuestCredentialAuthorizer } from "../src/modules/guest-access/guest-credential-authorizer";

export function createGuestBrowserTestModule(runtimePool: PostgresPool) {
  @Module({
    controllers: [
      GuestAccessController,
      GuestBrowserSessionController,
      GuestBrowserContextController,
    ],
    imports: [HttpInfrastructureModule],
    providers: [
      AntiAbuseKeyDeriver,
      AntiAbuseService,
      GuestAccessService,
      GuestAuthOriginPolicy,
      GuestBrowserSessionService,
      GuestBrowserContextService,
      GuestBrowserLimiter,
      GuestCredentialAuthorizer,
      TrustedClientAddressResolver,
      { provide: RUNTIME_POSTGRES_POOL, useValue: runtimePool },
    ],
  })
  class GuestBrowserTestModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
      consumer
        .apply(RequestIdMiddleware)
        .forRoutes(
          GuestAccessController,
          GuestBrowserSessionController,
          GuestBrowserContextController,
        );
    }
  }

  return GuestBrowserTestModule;
}
