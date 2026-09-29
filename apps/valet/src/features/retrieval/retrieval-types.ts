export type RetrievalFlowStep =
  | "task"
  | "key-checkout"
  | "in-progress"
  | "vehicle-ready"
  | "handoff"
  | "handoff-completed";

export interface RetrievalVehicleInfo {
  readonly color: string | null;
  readonly make: string | null;
  readonly model: string | null;
  readonly plateCountry: string | null;
  readonly plateNumberRaw: string | null;
  readonly temporaryDescriptor: string | null;
}

/**
 * Safe handoff verification snapshot mirrored from the authoritative A1
 * projection; never contains proof material.
 */
export interface RetrievalHandoffSnapshot {
  readonly pendingAt: string | null;
  readonly verification: {
    readonly method: "DYNAMIC_QR" | "PICKUP_CODE" | "SUPERVISOR_OVERRIDE";
    readonly status: "PENDING" | "VERIFIED";
    readonly verifiedAt: string | null;
  } | null;
}

export interface ActiveRetrievalSession {
  readonly expectedKeySlotCode: string | null;
  readonly expectedKeySlotId?: string | null;
  readonly handoff: RetrievalHandoffSnapshot;
  readonly isKeyConfirmed: boolean;
  readonly locationId: string;
  readonly parkingSpotCode: string | null;
  readonly parkingZoneCode: string | null;
  readonly readyAt: string | null;
  readonly retrievalStartedAt: string | null;
  readonly sessionId: string;
  readonly sessionVersion: number;
  readonly state:
    | "REQUESTED"
    | "RETRIEVING"
    | "READY"
    | "HANDOFF_PENDING"
    | "COMPLETED";
  readonly taskId: string;
  readonly taskStatus: "ACCEPTED" | "IN_PROGRESS" | "COMPLETED";
  readonly taskVersion: number;
  readonly verifiedKeySlotCode?: string | null;
  readonly verifiedKeySlotId?: string | null;
  readonly vehicle: RetrievalVehicleInfo;
}

export interface RetrievalState {
  readonly activeSession: ActiveRetrievalSession | null;
  readonly error: string | null;
  readonly isHydrating: boolean;
  readonly isSubmitting: boolean;
  readonly step: RetrievalFlowStep;
}
