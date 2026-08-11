import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";

import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../../common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../../common/http/api-request";
import { AntiAbuseModule } from "../anti-abuse/anti-abuse.module";
import { StaffAuthController } from "./staff-auth.controller";
import { StaffAuthOriginPolicy } from "./staff-auth.origin";
import {
  Argon2StaffPasswordVerifier,
  DatabaseStaffPrincipalResolver,
  STAFF_PASSWORD_VERIFIER,
  StaffAuthService,
} from "./staff-auth.service";
import { STAFF_PRINCIPAL_RESOLVER } from "./staff-principal";

@Module({
  controllers: [StaffAuthController],
  imports: [AntiAbuseModule, RuntimeDatabaseModule, HttpInfrastructureModule],
  providers: [
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
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes(StaffAuthController);
  }
}
