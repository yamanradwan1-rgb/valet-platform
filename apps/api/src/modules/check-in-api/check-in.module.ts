import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";

import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../../common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../../common/http/api-request";
import { AuthModule } from "../auth/auth.module";
import { CancelCheckInController } from "./cancel-check-in.controller";
import { CancelCheckInService } from "./cancel-check-in.service";
import { StaffCheckInController } from "./check-in-api.controller";
import { CheckInApiService } from "./check-in-api.service";
import { CheckInOperationRunner } from "./check-in-operation-runner";
import { ReturningCheckInController } from "./returning-check-in.controller";
import { PlateOcrController } from "./plate-ocr.controller";
import { PlateOcrAuthGuard } from "./plate-ocr-auth.guard";
import { PlateOcrService } from "./plate-ocr.service";
import { PlateOcrCostGuard } from "./plate-ocr-cost-guard";
import { PLATE_OCR_PROVIDER } from "./plate-ocr-provider";
import { resolvePlateOcrConfig } from "./plate-ocr-config";
import { PlateRecognizerSnapshotProvider } from "./plate-recognizer-snapshot.provider";

@Module({
  controllers: [
    StaffCheckInController,
    CancelCheckInController,
    ReturningCheckInController,
    PlateOcrController,
  ],
  imports: [AuthModule, RuntimeDatabaseModule, HttpInfrastructureModule],
  providers: [
    CheckInApiService,
    CancelCheckInService,
    CheckInOperationRunner,
    PlateOcrAuthGuard,
    PlateOcrService,
    {
      provide: PlateOcrCostGuard,
      useFactory: () =>
        new PlateOcrCostGuard(process.env.NODE_ENV, () => performance.now()),
    },
    {
      provide: PLATE_OCR_PROVIDER,
      useFactory: () => {
        const resolution = resolvePlateOcrConfig(process.env);
        return new PlateRecognizerSnapshotProvider(
          resolution.status === "configured" ? resolution.config : undefined,
          fetch,
          resolution.status === "unavailable" ? resolution.reason : undefined,
        );
      },
    },
  ],
})
export class CheckInModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes(StaffCheckInController);
    consumer.apply(RequestIdMiddleware).forRoutes(CancelCheckInController);
    consumer.apply(RequestIdMiddleware).forRoutes(ReturningCheckInController);
    consumer.apply(RequestIdMiddleware).forRoutes(PlateOcrController);
  }
}
