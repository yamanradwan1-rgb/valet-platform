import type {
  IncidentRecoveryMarker,
  IncidentRecoveryResponse,
  ReserveIncidentRecoveryResponse,
} from "@valet/contracts";

export type { IncidentRecoveryMarker } from "@valet/contracts";

export const INCIDENT_RECOVERY_LOCAL_DEADLINE_MS = 24 * 60 * 60 * 1000;

export interface IncidentRecoveryStore {
  delete(): Promise<void>;
  read(): Promise<unknown | null>;
  write(marker: IncidentRecoveryMarker): Promise<void>;
}

export interface IncidentRecoveryTransport {
  read(marker: IncidentRecoveryMarker): Promise<IncidentRecoveryResponse>;
  reserve(
    marker: IncidentRecoveryMarker,
  ): Promise<ReserveIncidentRecoveryResponse>;
  retire(marker: IncidentRecoveryMarker): Promise<IncidentRecoveryResponse>;
}

export type IncidentRecoveryResolution =
  | IncidentRecoveryResponse
  | {
      readonly outcome: "UNAVAILABLE";
    };
