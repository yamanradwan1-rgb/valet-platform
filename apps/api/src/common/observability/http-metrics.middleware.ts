import { performance } from "node:perf_hooks";
import type { IncomingMessage, ServerResponse } from "node:http";

import { Logger } from "@nestjs/common";

import {
  buildHttpMetric,
  classifyHttpOperation,
  formatHttpMetric,
} from "./http-operation-metrics";

const logger = new Logger("HttpMetrics");

/**
 * Register before all API application/authorization middleware. A controller
 * interceptor cannot measure a rejected guard, an unmapped route, or an
 * admission failure. The response finish event reports the actual final
 * status AFTER exception filters, without reading or logging request secrets.
 */
export function createHttpMetricsMiddleware(
  emit: (line: string) => void = (line) => logger.log(line),
) {
  return (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ): void => {
    const startedAt = performance.now();
    const operation = classifyHttpOperation(request.method, request.url);
    let emitted = false;

    const report = (status: number) => {
      if (emitted) return;
      emitted = true;
      try {
        emit(
          formatHttpMetric(
            buildHttpMetric(operation, status, performance.now() - startedAt),
          ),
        );
      } catch {
        // Telemetry failure must never modify the business response.
      }
    };

    response.once("finish", () => report(response.statusCode));
    response.once("close", () => {
      // A disconnected request has no completed HTTP response status.
      if (!emitted)
        report(response.writableFinished ? response.statusCode : 499);
    });
    next();
  };
}
