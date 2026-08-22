export type ParkingFlowStep = "in-progress" | "spot-scan" | "success";

export interface ParkingVehicleInfo {
  readonly color: string | null;
  readonly make: string | null;
  readonly model: string | null;
  readonly plateCountry: string | null;
  readonly plateNumberRaw: string | null;
  readonly temporaryDescriptor: string | null;
}

export interface ActiveParkingSession {
  readonly keySlotCode: string | null;
  readonly locationId: string;
  readonly parkedAt: string | null;
  readonly parkingSpotCode: string | null;
  readonly parkingStartedAt: string;
  readonly parkingZoneCode: string | null;
  readonly sessionId: string;
  readonly sessionVersion: number;
  readonly taskId: string;
  readonly taskVersion: number;
  readonly vehicle: ParkingVehicleInfo;
}

export interface ParkingState {
  readonly activeSession: ActiveParkingSession | null;
  readonly error: string | null;
  readonly isHydrating: boolean;
  readonly isSubmitting: boolean;
  readonly step: ParkingFlowStep;
}
