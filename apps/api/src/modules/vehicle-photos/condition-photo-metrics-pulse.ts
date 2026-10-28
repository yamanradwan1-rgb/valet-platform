import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import { conditionPhotoProcessingMetrics } from "./condition-photo-processing-metrics";

@Injectable()
export class ConditionPhotoMetricsPulse
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger("ConditionPhotoMetrics");
  private timer?: ReturnType<typeof setInterval>;

  onModuleInit() {
    this.timer = setInterval(() => {
      this.logger.log(
        `CONDITION_PHOTO_METRIC ${JSON.stringify(conditionPhotoProcessingMetrics.snapshot())}`,
      );
    }, 30_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }
}
