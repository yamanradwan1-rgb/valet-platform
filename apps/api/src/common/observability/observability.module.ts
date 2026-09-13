import { Module } from "@nestjs/common";

import {
  MONOTONIC_CLOCK,
  PerformanceMonotonicClock,
  OPERATION_OBSERVER,
} from "./operation-observability";
import { ConsoleOperationObserver } from "./console-operation-observer";

@Module({
  providers: [
    { provide: OPERATION_OBSERVER, useClass: ConsoleOperationObserver },
    { provide: MONOTONIC_CLOCK, useClass: PerformanceMonotonicClock },
  ],
  exports: [MONOTONIC_CLOCK, OPERATION_OBSERVER],
})
export class ObservabilityModule {}
