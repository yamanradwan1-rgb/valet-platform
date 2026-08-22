export type RetrievalFlowStep =
  | "task"
  | "key-checkout"
  | "in-progress"
  | "vehicle-ready";

export interface RetrievalVehicleInfo {
  readonly color: string | null;
  readonly make: string | null;
  readonly model: string | null;
  readonly plateCountry: string | null;
  readonly plateNumberRaw: string | null;
  readonly temporaryDescriptor: string | null;
}

export interface ActiveRetrievalSession {
  readonly expectedKeySlotCode: string | null;
  readonly isKeyConfirmed: boolean;
  readonly locationId: string;
  readonly parkingSpotCode: string | null;
  readonly parkingZoneCode: string | null;
  readonly readyAt: string | null;
  readonly retrievalStartedAt: string | null;
  readonly sessionId: string;
  readonly sessionVersion: number;
  readonly state: "REQUESTED" | "RETRIEVING" | "READY";
  readonly taskId: string;
  readonly taskStatus: "ACCEPTED" | "IN_PROGRESS";
  readonly taskVersion: number;
  readonly vehicle: RetrievalVehicleInfo;
}

export interface RetrievalState {
  readonly activeSession: ActiveRetrievalSession | null;
  readonly error: string | null;
  readonly isHydrating: boolean;
  readonly isSubmitting: boolean;
  readonly step: RetrievalFlowStep;
}
