import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import type { Pool } from "pg";

import { RUNTIME_POSTGRES_POOL } from "../src/common/database/runtime-database.module";
import { RequestIdMiddleware } from "../src/common/http/api-request";
import { HttpInfrastructureModule } from "../src/common/http/http-infrastructure.module";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../src/modules/auth/staff-principal";
import { StaffCheckInContinuationsController } from "../src/modules/staff/staff-check-in-continuations.controller";
import { StaffCheckInContinuationsService } from "../src/modules/staff/staff-check-in-continuations.service";
import { StaffValetSessionController } from "../src/modules/staff/staff-valet-session.controller";
import { StaffValetSessionService } from "../src/modules/staff/staff-valet-session.service";
import { StaffVehicleDirectoryService } from "../src/modules/staff/staff-vehicle-directory.service";

export function createStaffCheckInContinuationsTestModule(
  runtimePool: () => Pool,
  principalResolver: StaffPrincipalResolver,
) {
  @Module({
    controllers: [
      StaffCheckInContinuationsController,
      StaffValetSessionController,
    ],
    imports: [HttpInfrastructureModule],
    providers: [
      StaffCheckInContinuationsService,
      StaffValetSessionService,
      StaffVehicleDirectoryService,
      { provide: RUNTIME_POSTGRES_POOL, useFactory: runtimePool },
      { provide: STAFF_PRINCIPAL_RESOLVER, useValue: principalResolver },
    ],
  })
  class TestContinuationsModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
      consumer
        .apply(RequestIdMiddleware)
        .forRoutes(
          StaffCheckInContinuationsController,
          StaffValetSessionController,
        );
    }
  }

  return TestContinuationsModule;
}
