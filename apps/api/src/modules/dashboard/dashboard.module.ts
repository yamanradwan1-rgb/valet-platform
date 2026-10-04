import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../../common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../../common/http/api-request";
import { AuthModule } from "../auth/auth.module";
import { DashboardConfigurationController } from "./dashboard-configuration.controller";
import { DashboardConfigurationService } from "./dashboard-configuration-command";
import { DashboardAnalyticsController } from "./analytics.controller";
import { DashboardOverviewController } from "./overview.controller";
import { DashboardBrandingSubscriptionController } from "./branding.controller";
import { DashboardReportController } from "./report.controller";
import { DashboardScopeDiscoveryController } from "./dashboard-scope-discovery.controller";
import { DashboardScopeDiscoveryService } from "./dashboard-scope-discovery.service";
import { DashboardSubscriptionController } from "./subscription.controller";
import { DashboardFeatureAuthorityController } from "./dashboard-feature-authority.controller";
import { DashboardFeatureAuthorityService } from "./dashboard-feature-authority.service";
import { PhysicalResourceController } from "./physical-resource.controller";
import { PhysicalResourceReadService } from "./physical-resource-read.service";
import { PhysicalResourceWriteController } from "./physical-resource-write.controller";
import { PhysicalResourceWriteService } from "./physical-resource-write.service";
import { PresenceManagementService } from "../management/presence-management.service";
import {
  PresenceLmPolicyController,
  PresenceLmZoneController,
  PresenceLmExceptionController,
} from "./dashboard-presence.controller";

@Module({
  controllers: [
    PresenceLmPolicyController,
    PresenceLmZoneController,
    PresenceLmExceptionController,
    DashboardConfigurationController,
    DashboardOverviewController,
    DashboardAnalyticsController,
    DashboardReportController,
    DashboardBrandingSubscriptionController,
    DashboardSubscriptionController,
    DashboardScopeDiscoveryController,
    DashboardFeatureAuthorityController,
    PhysicalResourceController,
    PhysicalResourceWriteController,
  ],
  imports: [AuthModule, RuntimeDatabaseModule, HttpInfrastructureModule],
  providers: [
    PresenceManagementService,
    DashboardConfigurationService,
    DashboardFeatureAuthorityService,
    DashboardScopeDiscoveryService,
    PhysicalResourceReadService,
    PhysicalResourceWriteService,
  ],
})
export class DashboardModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(
        PresenceLmPolicyController,
        PresenceLmZoneController,
        PresenceLmExceptionController,
        DashboardConfigurationController,
        DashboardOverviewController,
        DashboardAnalyticsController,
        DashboardReportController,
        DashboardBrandingSubscriptionController,
        DashboardSubscriptionController,
        DashboardScopeDiscoveryController,
        DashboardFeatureAuthorityController,
        PhysicalResourceController,
        PhysicalResourceWriteController,
      );
  }
}
