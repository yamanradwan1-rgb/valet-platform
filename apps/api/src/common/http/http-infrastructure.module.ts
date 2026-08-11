import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";

import { ObservabilityModule } from "../observability/observability.module";
import { ApiOperationRunner } from "./api-operation-runner";
import { ApiExceptionFilter } from "./api-exception.filter";
import { RequestIdMiddleware } from "./api-request";

@Module({
  imports: [ObservabilityModule],
  providers: [
    ApiOperationRunner,
    RequestIdMiddleware,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
  exports: [ApiOperationRunner, ObservabilityModule, RequestIdMiddleware],
})
export class HttpInfrastructureModule {}
