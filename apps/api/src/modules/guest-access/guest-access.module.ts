import { GuestRequestAdmission } from "./guest-request-admission";
import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";

import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../../common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../../common/http/api-request";
import { AntiAbuseModule } from "../anti-abuse/anti-abuse.module";
import { AuthModule } from "../auth/auth.module";
import {
  GuestAccessController,
  StaffGuestAccessController,
} from "./guest-access.controller";
import { GuestAccessService } from "./guest-access.service";
import { GuestRatingController } from "./guest-rating.controller";
import { GuestRatingService } from "./guest-rating.service";
import { GuestBrowserSessionService } from "./guest-browser-session.service";
import { GuestBrowserSessionController } from "./guest-browser-session.controller";
import { GuestBrowserContextController } from "./guest-browser-context.controller";
import { GuestBrowserContextService } from "./guest-browser-context.service";
import { GuestBrowserLimiter } from "./guest-browser-limiter";
import { GuestAuthOriginPolicy } from "./guest-browser-transport";
import { GuestCredentialAuthorizer } from "./guest-credential-authorizer";
import { GuestInformationController } from "./guest-information.controller";
import { GuestInformationService } from "./guest-information.service";

@Module({
  controllers: [
    StaffGuestAccessController,
    GuestAccessController,
    GuestInformationController,
    GuestRatingController,
    GuestBrowserSessionController,
    GuestBrowserContextController,
  ],
  imports: [
    AuthModule,
    AntiAbuseModule,
    RuntimeDatabaseModule,
    HttpInfrastructureModule,
  ],
  providers: [
    GuestRequestAdmission,
    GuestAccessService,
    GuestBrowserSessionService,
    GuestBrowserContextService,
    GuestBrowserLimiter,
    GuestAuthOriginPolicy,
    GuestCredentialAuthorizer,
    GuestRatingService,
    GuestInformationService,
  ],
  exports: [
    GuestAccessService,
    GuestBrowserSessionService,
    GuestAuthOriginPolicy,
    GuestCredentialAuthorizer,
  ],
})
export class GuestAccessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(
        StaffGuestAccessController,
        GuestAccessController,
        GuestInformationController,
        GuestRatingController,
        GuestBrowserSessionController,
        GuestBrowserContextController,
      );
  }
}
