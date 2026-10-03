import type { PlateOcrResponse } from "@valet/employee-client";
import { logNativePlateOcr } from "./native-plate-ocr-diagnostics";
import { recordNativePlateOcrTelemetry } from "./native-plate-ocr-telemetry";
import type {
  NativePlateCameraTrace,
  PlateCameraTraceDetails,
} from "./native-plate-camera-trace";

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
    | {
        abort: AbortController;
        uri?: string;
        deleting?: Promise<void>;
        owner: PlateCameraTraceDetails;
      }
    | undefined;
  private operationSequence = 0;
  private loopOwner: PlateCameraTraceDetails = {};
  constructor(
    private readonly ports: NativePlateOcrPorts,
    private readonly current: (generation: number) => boolean,
    private readonly finish: (
      generation: number,
      result: PlateOcrResponse,
    ) => void,
    private readonly trace?: NativePlateCameraTrace,
  ) {}

  start(generation: number): boolean {
    if (this.timer !== undefined || this.operation !== undefined) {
      this.trace?.record("ocr-start-blocked", {
        generation,
        operationActive: this.operation !== undefined,
      });
      return false;
    }
    this.loopOwner = { ...this.trace?.owner(), generation };
    this.trace?.record("ocr-started", this.loopOwner);
    this.schedule(generation, 1);
    return true;
  }

  cancel(): void {
    this.trace?.record("ocr-stopped", {
      ...this.loopOwner,
      operationActive: this.operation !== undefined,
    });
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
      owner: {
        ...this.trace?.owner(),
        generation,
        attempt,
        operationId: ++this.operationSequence,
      },
    };
    this.trace?.record("capture-start", operation.owner);
    this.operation = operation;
    let result: PlateOcrResponse = { status: "UNAVAILABLE" };
    try {
      operation.uri = await this.ports.capture(operation.abort.signal);
      this.trace?.record("capture-success", {
        ...operation.owner,
        current: this.current(generation),
        aborted: operation.abort.signal.aborted,
      });
      if (this.current(generation)) {
        result = await this.ports.recognize(
          operation.uri,
          operation.abort.signal,
        );
      }
    } catch {
      this.trace?.record("capture-failure", {
        ...operation.owner,
        current: this.current(generation),
        aborted: operation.abort.signal.aborted,
      });
      // Telemetry: the capture/recognize chain itself failed before a
      // provider answer existed — that is a capture unavailability, not a
      // provider "UNAVAILABLE" answer.
      recordNativePlateOcrTelemetry("capture-unavailable");
      result = { status: "UNAVAILABLE" };
    } finally {
      try {
        await this.remove(operation);
      } catch {
        this.trace?.record("capture-cleanup-failure", operation.owner);
        result = { status: "UNAVAILABLE" };
      }
      this.operation = undefined;
      this.trace?.record("capture-cleanup", operation.owner);
    }
    if (!this.current(generation)) {
      this.trace?.record("capture-discard", {
        ...operation.owner,
        current: false,
      });
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
    this.trace?.record("ocr-finished", operation.owner);
    // Production telemetry: the definitive provider answer for this loop.
    recordNativePlateOcrTelemetry(result.status);
    this.finish(generation, result);
  }
}
