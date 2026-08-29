import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";

import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../../common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../../common/http/api-request";
import { AuthModule } from "../auth/auth.module";
import { StaffCheckInController } from "./check-in-api.controller";
import { CheckInApiService } from "./check-in-api.service";
import { CheckInOperationRunner } from "./check-in-operation-runner";
import { ReturningCheckInController } from "./returning-check-in.controller";

@Module({
  controllers: [StaffCheckInController, ReturningCheckInController],
  imports: [AuthModule, RuntimeDatabaseModule, HttpInfrastructureModule],
  providers: [CheckInApiService, CheckInOperationRunner],
})
export class CheckInModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes(StaffCheckInController);
    consumer.apply(RequestIdMiddleware).forRoutes(ReturningCheckInController);
  }
}
