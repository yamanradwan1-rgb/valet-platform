import type { PlateOcrResponse } from "@valet/employee-client";
import { logNativePlateOcr } from "./native-plate-ocr-diagnostics";
import { recordNativePlateOcrTelemetry } from "./native-plate-ocr-telemetry";
import {
  plateRoiCaptureFailureReason,
  plateRoiCaptureRotationDiagnosticCode,
} from "./native-plate-roi-failure";
import type {
  NativePlateCameraTrace,
  PlateCameraTraceDetails,
} from "./native-plate-camera-trace";

export interface NativePlateOcrPorts {
  capture(signal: AbortSignal): Promise<string>;
  recognize(uri: string, signal: AbortSignal): Promise<PlateOcrResponse>;
  remove(uri: string): Promise<void>;
  accept(plateNumberRaw: string): void;
}

interface PlateOcrOperation {
  readonly generation: number;
  readonly id: number;
  readonly abort: AbortController;
  readonly owner: PlateCameraTraceDetails;
  uri?: string;
  deleting?: Promise<void> | undefined;
}

/** One employee press owns one acquisition and at most one provider request. */
export class NativePlateOcrLoop {
  private operation: PlateOcrOperation | undefined;
  private operationSequence = 0;
  constructor(
    private readonly ports: NativePlateOcrPorts,
    private readonly current: (generation: number) => boolean,
    private readonly finish: (
      generation: number,
      operationId: number,
      result: PlateOcrResponse,
    ) => void,
    private readonly trace?: NativePlateCameraTrace,
  ) {}

  /** Claims the slot synchronously so same-tick/double presses cannot queue. */
  start(generation: number): number | undefined {
    if (this.operation !== undefined || !this.current(generation)) {
      this.trace?.record("ocr-start-blocked", {
        generation,
        operationActive: this.operation !== undefined,
      });
      return undefined;
    }
    const id = ++this.operationSequence;
    const operation: PlateOcrOperation = {
      generation,
      id,
      abort: new AbortController(),
      owner: {
        ...this.trace?.owner(),
        generation,
        attempt: id,
        operationId: id,
      },
    };
    this.operation = operation;
    this.trace?.record("ocr-started", operation.owner);
    void this.run(operation);
    return id;
  }

  cancel(): void {
    const operation = this.operation;
    this.trace?.record("ocr-stopped", {
      ...operation?.owner,
      operationActive: operation !== undefined,
    });
    if (!operation || operation.abort.signal.aborted) return;
    recordNativePlateOcrTelemetry("aborted");
    operation.abort.abort();
    // Keep the slot occupied until every late native/HTTP result is cleaned.
    void this.remove(operation).catch(() => undefined);
  }

  private isCurrent(operation: PlateOcrOperation): boolean {
    return (
      this.operation === operation &&
      !operation.abort.signal.aborted &&
      this.current(operation.generation)
    );
  }

  private remove(operation: PlateOcrOperation): Promise<void> {
    if (operation.uri === undefined) return Promise.resolve();
    operation.deleting ??= this.ports
      .remove(operation.uri)
      .catch((error: unknown) => {
        operation.deleting = undefined;
        throw error;
      });
    return operation.deleting;
  }

  private async run(operation: PlateOcrOperation): Promise<void> {
    const { generation } = operation;
    this.trace?.record("capture-start", operation.owner);
    let result: PlateOcrResponse = { status: "UNAVAILABLE" };
    let captureFailed = false;
    try {
      operation.uri = await this.ports.capture(operation.abort.signal);
      this.trace?.record("capture-success", {
        ...operation.owner,
        current: this.isCurrent(operation),
        aborted: operation.abort.signal.aborted,
      });
      if (this.isCurrent(operation))
        result = await this.ports.recognize(
          operation.uri,
          operation.abort.signal,
        );
    } catch (error) {
      captureFailed = operation.uri === undefined;
      if (captureFailed) {
        this.trace?.record("capture-failure", {
          ...operation.owner,
          current: this.isCurrent(operation),
          aborted: operation.abort.signal.aborted,
        });
        if (!operation.abort.signal.aborted)
          recordNativePlateOcrTelemetry(
            "capture-unavailable",
            plateRoiCaptureFailureReason(error),
            plateRoiCaptureRotationDiagnosticCode(error),
          );
      }
    }
    try {
      await this.remove(operation);
    } catch {
      this.trace?.record("capture-cleanup-failure", operation.owner);
      result = { status: "UNAVAILABLE" };
    }
    this.trace?.record("capture-cleanup", operation.owner);
    const current = this.isCurrent(operation);
    if (this.operation === operation) this.operation = undefined;
    if (!current) {
      this.trace?.record("capture-discard", {
        ...operation.owner,
        current: false,
      });
      logNativePlateOcr("generation-stale");
      return;
    }
    logNativePlateOcr("loop-finish", { status: result.status });
    this.trace?.record("ocr-finished", operation.owner);
    if (!captureFailed) recordNativePlateOcrTelemetry(result.status);
    this.finish(generation, operation.id, result);
  }
}
