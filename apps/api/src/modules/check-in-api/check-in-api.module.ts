import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { RequestIdMiddleware } from "../../common/http/api-request";
import { HttpInfrastructureModule } from "../../common/http/http-infrastructure.module";

import { StaffAuthController } from "../auth/staff-auth.controller";
import { AntiAbuseKeyDeriver } from "../anti-abuse/anti-abuse-key";
import { AntiAbuseService } from "../anti-abuse/anti-abuse.service";
import { TrustedClientAddressResolver } from "../anti-abuse/client-address";
import { StaffAuthOriginPolicy } from "../auth/staff-auth.origin";
import {
  Argon2StaffPasswordVerifier,
  DatabaseStaffPrincipalResolver,
  STAFF_PASSWORD_VERIFIER,
  StaffAuthService,
} from "../auth/staff-auth.service";

import { STAFF_PRINCIPAL_RESOLVER } from "./check-in-api.boundaries";
import {
  GuestCheckInController,
  StaffCheckInController,
} from "./check-in-api.controller";
import { CheckInApiService } from "./check-in-api.service";
import { CheckInOperationRunner } from "./check-in-operation-runner";

@Module({
  controllers: [
    StaffAuthController,
    StaffCheckInController,
    GuestCheckInController,
  ],
  imports: [HttpInfrastructureModule, RuntimeDatabaseModule],
  providers: [
    CheckInApiService,
    CheckInOperationRunner,
    AntiAbuseKeyDeriver,
    AntiAbuseService,
    TrustedClientAddressResolver,
    StaffAuthService,
    StaffAuthOriginPolicy,
    DatabaseStaffPrincipalResolver,
    Argon2StaffPasswordVerifier,
    {
      provide: STAFF_PRINCIPAL_RESOLVER,
      useExisting: DatabaseStaffPrincipalResolver,
    },
    {
      provide: STAFF_PASSWORD_VERIFIER,
      useExisting: Argon2StaffPasswordVerifier,
    },
  ],
  exports: [STAFF_PRINCIPAL_RESOLVER],
})
export class CheckInApiModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(
        StaffAuthController,
        StaffCheckInController,
        GuestCheckInController,
      );
  }
}
