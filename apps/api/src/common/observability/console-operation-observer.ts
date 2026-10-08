import { Injectable, Logger } from "@nestjs/common";

import type {
  OperationMeasurement,
  OperationObserver,
} from "./operation-observability";
import { formatGuestOperationMetric } from "./guest-operation-metrics";

/**
 * Collapses control characters (newlines, ANSI escapes, ...) so a hostile or
 * corrupted field can never forge additional log lines.
 */
function safeToken(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]/g, "");
}

/**
 * Renders a measurement as one structured log line built only from contract
 * fields (operation, outcome, errorCode?, requestId, durationMs). It never
 * renders request bodies, headers, tokens or other PII, and never throws.
 */
export function formatOperationMeasurement(
  measurement: OperationMeasurement,
): string {
  try {
    const tokens = [
      `operation=${safeToken(String(measurement.operation))}`,
      `outcome=${safeToken(String(measurement.outcome))}`,
      `requestId=${safeToken(String(measurement.requestId))}`,
      `durationMs=${safeToken(String(measurement.durationMs))}`,
    ];
    if (measurement.errorCode !== undefined && measurement.errorCode !== "") {
      tokens.push(`errorCode=${safeToken(String(measurement.errorCode))}`);
    }
    return `OPERATION ${tokens.join(" ")}`;
  } catch {
    return "OPERATION formatting-failed";
  }
}

@Injectable()
export class ConsoleOperationObserver implements OperationObserver {
  /**
   * Neutral context: this observer is provided globally by ObservabilityModule
   * and serves every measured operation (check-in, shifts, payments, push,
   * parking, tracking, retrieval, ...), not only check-in routes.
   */
  private readonly logger = new Logger("OperationObservability");

  observe(measurement: OperationMeasurement): void {
    try {
      // One structured line per measurement; fields stay contract-bounded.
      this.logger.log(formatOperationMeasurement(measurement));
      const guestMetric = formatGuestOperationMetric(measurement);
      if (guestMetric !== undefined) this.logger.log(guestMetric);
    } catch {
      // Observability must never break the instrumented operation.
    }
  }
}
