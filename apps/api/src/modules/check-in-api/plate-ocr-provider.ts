import type { PlateOcrRequest, PlateOcrResponse } from "@valet/contracts";
import type { PlateOcrDispatchPermit } from "./plate-ocr-provider-transport";

export const PLATE_OCR_PROVIDER = Symbol("PLATE_OCR_PROVIDER");
interface PlateOcrObservedBase {
  /** Neutral public response; observation metadata remains diagnostic only. */
  readonly response: PlateOcrResponse;
  readonly httpResponseComplete: boolean;
  readonly durationMs: number;
}
type OcrObservedFailure =
  "NONE" | "TIMEOUT" | "CANCELLED" | "NETWORK" | "PROVIDER" | "PARSE" | "OTHER";
/** Transport observations retained for provider diagnostics and regression tests. */
export type PlateOcrObservedResult = PlateOcrObservedBase &
  (
    | {
        readonly fetchInvoked: false;
        readonly disposition: "NOT_SENT";
        readonly observationClass: "NOT_INVOKED";
        readonly httpClass: "NONE";
        readonly failureClass: "NONE" | "CANCELLED" | "OTHER";
      }
    | {
        readonly fetchInvoked: true;
        readonly disposition: "UNKNOWN";
        readonly observationClass: "HTTP_COMPLETE";
        readonly httpClass: "2XX" | "4XX" | "5XX";
        readonly failureClass: OcrObservedFailure;
      }
    | {
        readonly fetchInvoked: true;
        readonly disposition: "UNKNOWN";
        readonly observationClass: "UNCERTAIN";
        readonly httpClass: "NONE";
        readonly failureClass: OcrObservedFailure;
      }
  );

export interface PlateOcrObservedOptions {
  readonly permit: PlateOcrDispatchPermit;
  readonly signal: AbortSignal;
}

export interface PlateOcrProvider {
  /** Local-only readiness; never probes or consumes provider account quota. */
  canDispatch(): boolean;
  recognize(input: {
    readonly image: Uint8Array;
    readonly plateCountry: PlateOcrRequest["plateCountry"];
  }): Promise<PlateOcrResponse>;
  recognizeObserved(
    input: Parameters<PlateOcrProvider["recognize"]>[0],
    options: PlateOcrObservedOptions,
  ): Promise<PlateOcrObservedResult>;
}
