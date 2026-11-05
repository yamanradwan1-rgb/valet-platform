import type { PlateOcrResponse } from "@valet/contracts";

/** Internal only. Obtained from committed Admission A, never a request DTO. */
export interface OcrSettlementHandle {
  readonly attemptId: string;
  readonly organizationId: string;
  readonly membershipId: string;
  readonly locationId: string;
  readonly periodId: string;
  readonly accountAlias: string;
  readonly ownerNonce: string;
  readonly revision: bigint | number | string;
}

export type OcrFailureClass =
  "NONE" | "TIMEOUT" | "NETWORK" | "PROVIDER" | "PARSE" | "CANCELLED" | "OTHER";

interface ObservedBase {
  /** Transient public projection; never persisted in the attempt table. */
  readonly response: PlateOcrResponse;
  /** Elapsed local operation duration, bounded to 0..120000 ms. */
  readonly durationMs: number;
}

/** Only the current live dispatch owner may prove fetch was never invoked. */
export interface OcrVerifiedNotSent extends ObservedBase {
  readonly fetchInvoked: false;
  readonly disposition: "NOT_SENT";
  readonly observationClass: "NOT_INVOKED";
  readonly httpClass: "NONE";
  readonly failureClass: "NONE" | "CANCELLED" | "OTHER";
}

/** An invoked fetch holds remote exposure even after a complete HTTP reply. */
export type OcrInvokedObservation = ObservedBase &
  (
    | {
        readonly fetchInvoked: true;
        readonly disposition: "UNKNOWN";
        readonly observationClass: "HTTP_COMPLETE";
        readonly httpClass: "2XX" | "4XX" | "5XX";
        readonly failureClass: OcrFailureClass;
      }
    | {
        readonly fetchInvoked: true;
        readonly disposition: "UNKNOWN";
        readonly observationClass: "UNCERTAIN";
        readonly httpClass: "NONE";
        readonly failureClass: OcrFailureClass;
      }
  );

/** Match the strict CHECK allowlists in the Issue #429 migration. */
export type OcrObservedResult = OcrVerifiedNotSent | OcrInvokedObservation;
