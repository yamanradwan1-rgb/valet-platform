import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";

import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../../common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../../common/http/api-request";
import { AuthModule } from "../auth/auth.module";
import { AntiAbuseModule } from "../anti-abuse/anti-abuse.module";
import { ShiftController } from "./shift.controller";
import { ShiftService } from "./shift.service";
import { ShiftPresenceService } from "./shift-presence.service";
import { ShiftPresenceController } from "./shift-presence.controller";

@Module({
  controllers: [ShiftController, ShiftPresenceController],
  imports: [
    AuthModule,
    RuntimeDatabaseModule,
    HttpInfrastructureModule,
    AntiAbuseModule,
  ],
  providers: [ShiftService, ShiftPresenceService],
})
export class ShiftModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(ShiftController, ShiftPresenceController);
  }
}
