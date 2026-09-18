import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";

import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../../common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../../common/http/api-request";
import { AuthModule } from "../auth/auth.module";
import { PaymentsModule } from "../payments/payments.module";
import { ManagementCompanyReportController } from "./company-report.controller";
import { ManagementCompanyReportExportService } from "./company-report-export-service";
import { ManagementCompanyReportService } from "./company-report-read-service";
import { ManagementCommercialController } from "./management-commercial.controller";
import { ManagementCommercialReadService } from "./management-commercial-read.service";
import { ManagementContextController } from "./management-context.controller";
import { ManagementContextService } from "./management-context.service";
import { ManagementCompanyAnalyticsController } from "./management-company-analytics.controller";
import { ManagementCompanyAnalyticsService } from "./management-company-analytics.service";
import { ManagementIntegrationsService } from "./management-integrations.service";
import { ManagementAuditController } from "./management-audit.controller";
import { ManagementAuditService } from "./management-audit.service";
import { ManagementSettingsController } from "./management-settings.controller";
import { ManagementSettingsService } from "./management-settings.service";
import { ManagementBrandingController } from "./management-branding.controller";
import { ManagementBrandingService } from "./management-branding.service";
import { ManagementLocationController } from "./management-location.controller";
import { ManagementLocationService } from "./management-location.service";
import { ManagementVisitContactController } from "./management-visit-contact.controller";
import { ManagementVisitContactService } from "./management-visit-contact.service";
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
    ManagementLocationController,
    ManagementVisitContactController,
    ManagementCompanyAnalyticsController,
    ManagementCompanyReportController,
    ManagementCommercialController,
  ],
  imports: [
    AuthModule,
    PaymentsModule,
    RuntimeDatabaseModule,
    HttpInfrastructureModule,
  ],
  providers: [
    ManagementContextService,
    ManagementAuditService,
    StaffDirectoryService,
    StaffManagementMutationService,
    ManagementSettingsService,
    ManagementBrandingService,
    ManagementLocationService,
    ManagementVisitContactService,
    ManagementCompanyAnalyticsService,
    ManagementCompanyReportService,
    ManagementCompanyReportExportService,
    ManagementCommercialReadService,
    ManagementIntegrationsService,
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
        ManagementLocationController,
        ManagementVisitContactController,
        ManagementCompanyAnalyticsController,
        ManagementCompanyReportController,
        ManagementCommercialController,
      );
  }
}
