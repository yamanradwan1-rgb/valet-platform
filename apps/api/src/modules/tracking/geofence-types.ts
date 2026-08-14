import type { GeoPoint } from "./point-in-polygon";

export type GeofencePurpose = "OVERFLOW" | "PARKING" | "RESTRICTED" | "STAGING";

export interface GeofenceArea {
  readonly id: string;
  readonly purpose: GeofencePurpose;
  readonly vertices: readonly GeoPoint[];
}

export interface OperationalFrontier extends GeoPoint {
  readonly capturedAt: Date;
  readonly id: string;
}

export interface PendingGeofenceEvent {
  readonly mapAreaId: string;
  readonly occurredAt: Date;
  readonly type: "ENTERED" | "EXITED" | "VIOLATION";
}
