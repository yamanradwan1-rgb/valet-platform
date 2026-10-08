import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";

import { RequestIdMiddleware } from "../../common/http/api-request";
import { HttpInfrastructureModule } from "../../common/http/http-infrastructure.module";
import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { AntiAbuseModule } from "../anti-abuse/anti-abuse.module";
import { GuestAccessModule } from "../guest-access/guest-access.module";
import { GuestPushRegistrationController } from "./guest-push-registration.controller";
import { GuestPushRegistrationService } from "./guest-push-registration.service";

@Module({
  controllers: [GuestPushRegistrationController],
  imports: [
    AntiAbuseModule,
    GuestAccessModule,
    HttpInfrastructureModule,
    RuntimeDatabaseModule,
  ],
  providers: [GuestPushRegistrationService],
})
export class GuestPushRegistrationModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes(GuestPushRegistrationController);
  }
}
