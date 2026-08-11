import { Module } from "@nestjs/common";

import {
  MONOTONIC_CLOCK,
  NoopOperationObserver,
  OPERATION_OBSERVER,
  PerformanceMonotonicClock,
} from "./operation-observability";

@Module({
  providers: [
    { provide: OPERATION_OBSERVER, useClass: NoopOperationObserver },
    { provide: MONOTONIC_CLOCK, useClass: PerformanceMonotonicClock },
  ],
  exports: [MONOTONIC_CLOCK, OPERATION_OBSERVER],
})
export class ObservabilityModule {}
