import type { PlateOcrResponse } from "@valet/employee-client";
import { logNativePlateOcr } from "./native-plate-ocr-diagnostics";
import { recordNativePlateOcrTelemetry } from "./native-plate-ocr-telemetry";

export const NATIVE_PLATE_OCR_INTERVAL_MS = 1200;
export const NATIVE_PLATE_OCR_MAX_ATTEMPTS = 5;

export interface NativePlateOcrPorts {
  capture(signal: AbortSignal): Promise<string>;
  recognize(uri: string, signal: AbortSignal): Promise<PlateOcrResponse>;
  remove(uri: string): Promise<void>;
  accept(plateNumberRaw: string): void;
}

/** One transient operation across generations; no queued captures or uploads. */
export class NativePlateOcrLoop {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private operation:
    | { abort: AbortController; uri?: string; deleting?: Promise<void> }
    | undefined;
  constructor(
    private readonly ports: NativePlateOcrPorts,
    private readonly current: (generation: number) => boolean,
    private readonly finish: (
      generation: number,
      result: PlateOcrResponse,
    ) => void,
  ) {}

  start(generation: number): boolean {
    if (this.timer !== undefined || this.operation !== undefined) return false;
    this.schedule(generation, 1);
    return true;
  }

  cancel(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const operation = this.operation;
    if (!operation) return;
    // Production telemetry: a user-driven cancellation before completion.
    recordNativePlateOcrTelemetry("aborted");
    operation.abort.abort();
    // Cancellation cleans a captured file without waiting for an uncooperative HTTP promise.
    void this.remove(operation).catch(() => undefined);
  }

  private remove(
    operation: NonNullable<NativePlateOcrLoop["operation"]>,
  ): Promise<void> {
    if (operation.uri === undefined) return Promise.resolve();
    operation.deleting ??= this.ports
      .remove(operation.uri)
      .catch((error: unknown) => {
        delete operation.deleting;
        throw error;
      });
    return operation.deleting;
  }

  private schedule(generation: number, attempt: number): void {
    this.timer = setTimeout(() => {
      void this.run(generation, attempt);
    }, NATIVE_PLATE_OCR_INTERVAL_MS);
  }

  private async run(generation: number, attempt: number): Promise<void> {
    this.timer = undefined;
    if (!this.current(generation)) {
      logNativePlateOcr("generation-stale");
      return;
    }
    if (this.operation !== undefined) return;
    const operation: NonNullable<NativePlateOcrLoop["operation"]> = {
      abort: new AbortController(),
    };
    this.operation = operation;
    let result: PlateOcrResponse = { status: "UNAVAILABLE" };
    try {
      operation.uri = await this.ports.capture(operation.abort.signal);
      if (this.current(generation)) {
        result = await this.ports.recognize(
          operation.uri,
          operation.abort.signal,
        );
      }
    } catch {
      // Telemetry: the capture/recognize chain itself failed before a
      // provider answer existed — that is a capture unavailability, not a
      // provider "UNAVAILABLE" answer.
      recordNativePlateOcrTelemetry("capture-unavailable");
      result = { status: "UNAVAILABLE" };
    } finally {
      try {
        await this.remove(operation);
      } catch {
        result = { status: "UNAVAILABLE" };
      }
      this.operation = undefined;
    }
    if (!this.current(generation)) {
      logNativePlateOcr("generation-stale");
      return;
    }
    if (
      result.status === "NO_MATCH" &&
      attempt < NATIVE_PLATE_OCR_MAX_ATTEMPTS
    ) {
      this.schedule(generation, attempt + 1);
      return;
    }
    logNativePlateOcr("loop-finish", { status: result.status });
    // Production telemetry: the definitive provider answer for this loop.
    recordNativePlateOcrTelemetry(result.status);
    this.finish(generation, result);
  }
}
