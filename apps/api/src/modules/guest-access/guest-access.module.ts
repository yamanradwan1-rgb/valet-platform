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

@Module({
  controllers: [StaffGuestAccessController, GuestAccessController],
  imports: [
    AuthModule,
    AntiAbuseModule,
    RuntimeDatabaseModule,
    HttpInfrastructureModule,
  ],
  providers: [GuestAccessService],
})
export class GuestAccessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(StaffGuestAccessController, GuestAccessController);
  }
}
