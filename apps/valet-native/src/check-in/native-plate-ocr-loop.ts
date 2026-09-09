import type { PlateOcrResponse } from "@valet/employee-client";
import { logNativePlateOcr } from "./native-plate-ocr-diagnostics";

export interface NativePlateOcrPorts {
  capture(signal: AbortSignal): Promise<string>;
  recognize(uri: string, signal: AbortSignal): Promise<PlateOcrResponse>;
  remove(uri: string): Promise<void>;
  accept(plateNumberRaw: string): void;
}

/** One transient operation across generations; no queued captures or uploads. */
export class NativePlateOcrLoop {
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
    if (this.operation !== undefined) return false;
    void this.run(generation);
    return true;
  }

  cancel(): void {
    const operation = this.operation;
    if (!operation) return;
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

  private async run(generation: number): Promise<void> {
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
    logNativePlateOcr("loop-finish", { status: result.status });
    this.finish(generation, result);
  }
}
