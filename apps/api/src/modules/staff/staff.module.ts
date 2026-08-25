import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";

import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../../common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../../common/http/api-request";
import { AuthModule } from "../auth/auth.module";
import { IncidentReportingController } from "../incidents/incident-reporting.controller";
import { IncidentReportingService } from "../incidents/incident-reporting.service";
import { StaffCheckInContinuationsController } from "./staff-check-in-continuations.controller";
import { StaffCheckInContinuationsService } from "./staff-check-in-continuations.service";
import { StaffCheckInDraftsController } from "./staff-check-in-drafts.controller";
import { StaffCheckInDraftsService } from "./staff-check-in-drafts.service";
import { StaffOperationalContextController } from "./staff-operational-context.controller";
import { StaffOperationalContextService } from "./staff-operational-context.service";
import { StaffValetSessionController } from "./staff-valet-session.controller";
import { StaffValetSessionService } from "./staff-valet-session.service";
import { StaffVehicleDirectoryService } from "./staff-vehicle-directory.service";

@Module({
  controllers: [
    StaffCheckInContinuationsController,
    StaffCheckInDraftsController,
    StaffOperationalContextController,
    StaffValetSessionController,
    IncidentReportingController,
  ],
  imports: [AuthModule, RuntimeDatabaseModule, HttpInfrastructureModule],
  providers: [
    StaffCheckInContinuationsService,
    StaffCheckInDraftsService,
    StaffOperationalContextService,
    StaffValetSessionService,
    StaffVehicleDirectoryService,
    IncidentReportingService,
  ],
})
export class StaffModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(
        StaffCheckInContinuationsController,
        StaffCheckInDraftsController,
        StaffOperationalContextController,
        StaffValetSessionController,
        IncidentReportingController,
      );
  }
}
