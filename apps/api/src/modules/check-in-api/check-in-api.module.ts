import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";

import { StaffAuthController } from "../auth/staff-auth.controller";
import { StaffAuthOriginPolicy } from "../auth/staff-auth.origin";
import {
  Argon2StaffPasswordVerifier,
  DatabaseStaffPrincipalResolver,
  STAFF_PASSWORD_VERIFIER,
  StaffAuthService,
} from "../auth/staff-auth.service";

import {
  CHECK_IN_MONOTONIC_CLOCK,
  CHECK_IN_OPERATION_OBSERVER,
  CHECK_IN_POSTGRES_POOL,
  NoopCheckInOperationObserver,
  PerformanceMonotonicClock,
  RequestIdMiddleware,
  RuntimePoolLifecycle,
  STAFF_PRINCIPAL_RESOLVER,
  createCheckInRuntimePool,
} from "./check-in-api.boundaries";
import {
  GuestCheckInController,
  StaffCheckInController,
} from "./check-in-api.controller";
import { CheckInApiService } from "./check-in-api.service";
import { CheckInApiExceptionFilter } from "./check-in-api-exception.filter";
import { CheckInOperationRunner } from "./check-in-operation-runner";

@Module({
  controllers: [
    StaffAuthController,
    StaffCheckInController,
    GuestCheckInController,
  ],
  providers: [
    CheckInApiService,
    CheckInOperationRunner,
    StaffAuthService,
    StaffAuthOriginPolicy,
    DatabaseStaffPrincipalResolver,
    Argon2StaffPasswordVerifier,
    RequestIdMiddleware,
    RuntimePoolLifecycle,
    {
      provide: APP_FILTER,
      useClass: CheckInApiExceptionFilter,
    },
    {
      provide: CHECK_IN_POSTGRES_POOL,
      useFactory: createCheckInRuntimePool,
    },
    {
      provide: STAFF_PRINCIPAL_RESOLVER,
      useExisting: DatabaseStaffPrincipalResolver,
    },
    {
      provide: STAFF_PASSWORD_VERIFIER,
      useExisting: Argon2StaffPasswordVerifier,
    },
    {
      provide: CHECK_IN_OPERATION_OBSERVER,
      useClass: NoopCheckInOperationObserver,
    },
    {
      provide: CHECK_IN_MONOTONIC_CLOCK,
      useClass: PerformanceMonotonicClock,
    },
  ],
  exports: [
    CHECK_IN_MONOTONIC_CLOCK,
    CHECK_IN_OPERATION_OBSERVER,
    CHECK_IN_POSTGRES_POOL,
    STAFF_PRINCIPAL_RESOLVER,
  ],
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
