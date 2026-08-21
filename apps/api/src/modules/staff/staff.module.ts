import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";

import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../../common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../../common/http/api-request";
import { AuthModule } from "../auth/auth.module";
import { StaffOperationalContextController } from "./staff-operational-context.controller";
import { StaffOperationalContextService } from "./staff-operational-context.service";

@Module({
  controllers: [StaffOperationalContextController],
  imports: [AuthModule, RuntimeDatabaseModule, HttpInfrastructureModule],
  providers: [StaffOperationalContextService],
})
export class StaffModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(StaffOperationalContextController);
  }
}
