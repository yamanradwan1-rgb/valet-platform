import { Injectable } from "@nestjs/common";

export const OPERATION_OBSERVER = Symbol("OPERATION_OBSERVER");
export const MONOTONIC_CLOCK = Symbol("MONOTONIC_CLOCK");

export interface MonotonicClock {
  now(): number;
}
export interface OperationMeasurement {
  readonly durationMs: number;
  readonly errorCode?: string;
  readonly operation: string;
  readonly outcome: "ERROR" | "SUCCESS";
  readonly requestId: string;
}
export interface OperationObserver {
  observe(measurement: OperationMeasurement): Promise<void> | void;
}

@Injectable()
export class NoopOperationObserver implements OperationObserver {
  observe(measurement: OperationMeasurement): void {
    void measurement;
  }
}
@Injectable()
export class PerformanceMonotonicClock implements MonotonicClock {
  now(): number {
    return performance.now();
  }
}
