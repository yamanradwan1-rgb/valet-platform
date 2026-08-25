import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../../common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../../common/http/api-request";
import { AuthModule } from "../auth/auth.module";
import { DashboardConfigurationController } from "./dashboard-configuration.controller";
import { DashboardConfigurationService } from "./dashboard-configuration-command";
import { DashboardAnalyticsController } from "./analytics.controller";
import { DashboardLocationsController } from "./dashboard-locations.controller";
import { DashboardOverviewController } from "./overview.controller";
import { DashboardBrandingSubscriptionController } from "./branding.controller";
import { DashboardReportController } from "./report.controller";
import { DashboardSubscriptionController } from "./subscription.controller";

@Module({
  controllers: [
    DashboardConfigurationController,
    DashboardLocationsController,
    DashboardOverviewController,
    DashboardAnalyticsController,
    DashboardReportController,
    DashboardBrandingSubscriptionController,
    DashboardSubscriptionController,
  ],
  imports: [AuthModule, RuntimeDatabaseModule, HttpInfrastructureModule],
  providers: [DashboardConfigurationService],
})
export class DashboardModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(
        DashboardConfigurationController,
        DashboardLocationsController,
        DashboardOverviewController,
        DashboardAnalyticsController,
        DashboardReportController,
        DashboardBrandingSubscriptionController,
        DashboardSubscriptionController,
      );
  }
}
