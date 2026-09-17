import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";

import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../../common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../../common/http/api-request";
import { AuthModule } from "../auth/auth.module";
import { ManagementContextController } from "./management-context.controller";
import { ManagementContextService } from "./management-context.service";
import { ManagementAuditController } from "./management-audit.controller";
import { ManagementAuditService } from "./management-audit.service";
import { ManagementSettingsController } from "./management-settings.controller";
import { ManagementSettingsService } from "./management-settings.service";
import { ManagementBrandingController } from "./management-branding.controller";
import { ManagementBrandingService } from "./management-branding.service";
import { StaffDirectoryService } from "./staff-directory.service";
import { StaffManagementController } from "./staff-management.controller";
import { StaffManagementMutationService } from "./staff-management-mutation.service";

@Module({
  controllers: [
    ManagementContextController,
    ManagementAuditController,
    StaffManagementController,
    ManagementSettingsController,
    ManagementBrandingController,
  ],
  imports: [AuthModule, RuntimeDatabaseModule, HttpInfrastructureModule],
  providers: [
    ManagementContextService,
    ManagementAuditService,
    StaffDirectoryService,
    StaffManagementMutationService,
    ManagementSettingsService,
    ManagementBrandingService,
  ],
  exports: [ManagementContextService],
})
export class ManagementModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(
        ManagementContextController,
        ManagementAuditController,
        StaffManagementController,
        ManagementSettingsController,
        ManagementBrandingController,
      );
  }
}
