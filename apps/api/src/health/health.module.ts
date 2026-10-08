import { Module } from "@nestjs/common";

import { RuntimeDatabaseModule } from "../common/database/runtime-database.module";
import { RuntimeMetricsPulse } from "../common/observability/runtime-metrics-pulse";
import { AntiAbuseModule } from "../modules/anti-abuse/anti-abuse.module";
import { GuestAccessModule } from "../modules/guest-access/guest-access.module";
import { ApplicationDrainState } from "./application-drain-state";
import { GracefulDrainLifecycle } from "./graceful-drain.lifecycle";
import { HealthController } from "./health.controller";
import { HealthReadinessService } from "./health-readiness.service";

@Module({
  imports: [RuntimeDatabaseModule, AntiAbuseModule, GuestAccessModule],
  controllers: [HealthController],
  providers: [
    ApplicationDrainState,
    GracefulDrainLifecycle,
    HealthReadinessService,
    RuntimeMetricsPulse,
  ],
  exports: [ApplicationDrainState],
})
export class HealthModule {}
