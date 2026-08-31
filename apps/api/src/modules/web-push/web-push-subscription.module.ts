import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { loadWebPushServerConfig } from "@valet/config";

import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../../common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../../common/http/api-request";
import { AntiAbuseModule } from "../anti-abuse/anti-abuse.module";
import {
  GuestWebPushSubscriptionController,
  StaffWebPushSubscriptionController,
} from "./web-push-subscription.controller";
import { WebPushSubscriptionService } from "./web-push-subscription.service";
import { WEB_PUSH_SERVER_CONFIG } from "./web-push-subscription.tokens";

@Module({
  controllers: [
    StaffWebPushSubscriptionController,
    GuestWebPushSubscriptionController,
  ],
  imports: [AntiAbuseModule, RuntimeDatabaseModule, HttpInfrastructureModule],
  providers: [
    WebPushSubscriptionService,
    { provide: WEB_PUSH_SERVER_CONFIG, useFactory: loadWebPushServerConfig },
  ],
  exports: [WEB_PUSH_SERVER_CONFIG],
})
export class WebPushSubscriptionModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(
        StaffWebPushSubscriptionController,
        GuestWebPushSubscriptionController,
      );
  }
}
