import type { PlateOcrResponse } from "@valet/employee-client";

export const NATIVE_PLATE_OCR_INTERVAL_MS = 1200;
export const NATIVE_PLATE_OCR_MAX_ATTEMPTS = 5;
export interface NativePlateOcrPorts {
  capture(): Promise<string>;
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

  start(generation: number): void {
    if (this.operation !== undefined) {
      this.finish(generation, { status: "UNAVAILABLE" });
      return;
    }
    this.schedule(generation, 1);
  }

  cancel(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
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

  private schedule(generation: number, attempt: number): void {
    this.timer = setTimeout(() => {
      void this.run(generation, attempt);
    }, NATIVE_PLATE_OCR_INTERVAL_MS);
  }

  private async run(generation: number, attempt: number): Promise<void> {
    this.timer = undefined;
    if (!this.current(generation) || this.operation !== undefined) return;
    const operation: NonNullable<NativePlateOcrLoop["operation"]> = {
      abort: new AbortController(),
    };
    this.operation = operation;
    let result: PlateOcrResponse = { status: "UNAVAILABLE" };
    try {
      operation.uri = await this.ports.capture();
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
    if (!this.current(generation)) return;
    if (
      result.status === "NO_MATCH" &&
      attempt < NATIVE_PLATE_OCR_MAX_ATTEMPTS
    ) {
      this.schedule(generation, attempt + 1);
    } else {
      this.finish(generation, result);
    }
  }
}
