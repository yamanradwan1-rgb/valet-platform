import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";

import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../../common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../../common/http/api-request";
import { AntiAbuseModule } from "../anti-abuse/anti-abuse.module";
import { StaffActivationController } from "./staff-activation.controller";
import { StaffActivationService } from "./staff-activation.service";
import { NativeStaffAuthController } from "./native-staff-auth.controller";
import { StaffAuthController } from "./staff-auth.controller";
import { StaffLoginService } from "./staff-login.service";
import { StaffAuthOriginPolicy } from "./staff-auth.origin";
import { MfaAntiAbuse } from "./mfa/mfa-anti-abuse";
import { MfaAssurancePolicy } from "./mfa/mfa-assurance-policy";
import { MfaEnrollmentService } from "./mfa/mfa-enrollment.service";
import { MfaRecoveryService } from "./mfa/mfa-recovery.service";
import { MfaStateService } from "./mfa/mfa-state.service";
import { MfaStepUpService } from "./mfa/mfa-step-up.service";
import { StaffMfaController } from "./mfa/staff-mfa.controller";
import {
  Argon2StaffPasswordVerifier,
  STAFF_PASSWORD_VERIFIER,
  StaffAuthService,
} from "./staff-auth.service";
import { STAFF_PRINCIPAL_RESOLVER } from "./staff-principal";
import {
  DatabaseStaffPrincipalResolver,
  DatabaseStaffSessionContextResolver,
  STAFF_SESSION_CONTEXT_RESOLVER,
} from "./staff-session-context";

@Module({
  controllers: [
    StaffActivationController,
    StaffAuthController,
    NativeStaffAuthController,
    StaffMfaController,
  ],
  imports: [AntiAbuseModule, RuntimeDatabaseModule, HttpInfrastructureModule],
  providers: [
    StaffAuthService,
    StaffLoginService,
    StaffActivationService,
    StaffAuthOriginPolicy,
    MfaAntiAbuse,
    MfaAssurancePolicy,
    MfaEnrollmentService,
    MfaRecoveryService,
    MfaStateService,
    MfaStepUpService,
    DatabaseStaffSessionContextResolver,
    DatabaseStaffPrincipalResolver,
    Argon2StaffPasswordVerifier,
    {
      provide: STAFF_PRINCIPAL_RESOLVER,
      useExisting: DatabaseStaffPrincipalResolver,
    },
    {
      provide: STAFF_SESSION_CONTEXT_RESOLVER,
      useExisting: DatabaseStaffSessionContextResolver,
    },
    {
      provide: STAFF_PASSWORD_VERIFIER,
      useExisting: Argon2StaffPasswordVerifier,
    },
  ],
  exports: [
    STAFF_PRINCIPAL_RESOLVER,
    STAFF_SESSION_CONTEXT_RESOLVER,
    MfaAssurancePolicy,
  ],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(
        StaffActivationController,
        StaffAuthController,
        NativeStaffAuthController,
        StaffMfaController,
      );
  }
}
