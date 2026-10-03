import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";

import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../../common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../../common/http/api-request";
import { AuthModule } from "../auth/auth.module";
import { ConfirmParkedController } from "./confirm-parked.controller";
import { ConfirmParkedService } from "./confirm-parked.service";
import { StartParkingController } from "./start-parking.controller";
import { StartParkingService } from "./start-parking.service";
import { CancelBeforeParkingController } from "./cancel-before-parking.controller";
import { CancelBeforeParkingService } from "./cancel-before-parking.service";

@Module({
  controllers: [
    StartParkingController,
    ConfirmParkedController,
    CancelBeforeParkingController,
  ],
  imports: [AuthModule, RuntimeDatabaseModule, HttpInfrastructureModule],
  providers: [
    StartParkingService,
    ConfirmParkedService,
    CancelBeforeParkingService,
  ],
})
export class StartParkingModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(
        StartParkingController,
        ConfirmParkedController,
        CancelBeforeParkingController,
      );
  }
}
