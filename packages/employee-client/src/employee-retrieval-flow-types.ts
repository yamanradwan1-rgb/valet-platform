import type {
  StaffTaskQueueItem,
  StaffValetSessionDetailResponse,
  TaskQueueResponse,
} from "@valet/contracts";
import {
  markReadyResponseSchema,
  startRetrievalResponseSchema,
} from "@valet/contracts";

import type {
  EmployeeOperationalFailure,
  EmployeeOperationalScope,
} from "./employee-operational-types";

/**
 * Response types derived from the exact existing shared schemas, matching
 * the Employee Web retrieval feature's contract usage.
 */
export type EmployeeRetrievalStartResult = ReturnType<
  typeof startRetrievalResponseSchema.parse
>;
export type EmployeeRetrievalReadyResult = ReturnType<
  typeof markReadyResponseSchema.parse
>;

/**
 * Portable Retrieval workflow phases (MOB-013).
 *
 * The phase tracks the employee's current operational stage through the
 * canonical physical path REQUESTED -> RETRIEVING -> READY using only
 * authoritative server projections. "ready" is a truthful terminal boundary
 * of this slice: handoff work belongs to MOB-014A/B.
 */
export type EmployeeRetrievalPhase =
  | "ambiguous"
  | "assigned"
  | "conflict"
  | "inactive"
  | "key-checkout"
  | "loading"
  | "ready"
  | "reconciling"
  | "retrieving"
  | "submitting-start"
  | "submitting-ready"
  | "unavailable";

export interface EmployeeRetrievalSnapshot {
  readonly failure: EmployeeOperationalFailure | null;
  readonly identityGeneration: number | null;
  readonly keyConfirmed: boolean;
  readonly keySlotCandidate: string;
  readonly keySlotResourceId: string | null;
  readonly phase: EmployeeRetrievalPhase;
  readonly readyAt: string | null;
  readonly retrievalStartedAt: string | null;
  readonly scope: EmployeeOperationalScope | null;
  readonly session: StaffValetSessionDetailResponse | null;
  readonly task: StaffTaskQueueItem | null;
}

export interface EmployeeRetrievalTransport {
  loadSession(sessionId: string): Promise<StaffValetSessionDetailResponse>;
  loadTaskQueue(locationId: string): Promise<TaskQueueResponse>;
  startRetrieval(
    sessionId: string,
    expectedSessionVersion: number,
    expectedTaskVersion: number,
    scannedKeySlot?:
      | { readonly keySlotCode: string; readonly keySlotId: string }
      | undefined,
  ): Promise<EmployeeRetrievalStartResult>;
  markReady(
    sessionId: string,
    expectedSessionVersion: number,
  ): Promise<EmployeeRetrievalReadyResult>;
}

export interface EmployeeRetrievalOptions {
  readonly onStateChange?:
    ((snapshot: EmployeeRetrievalSnapshot) => void) | undefined;
  readonly transport: EmployeeRetrievalTransport;
}
