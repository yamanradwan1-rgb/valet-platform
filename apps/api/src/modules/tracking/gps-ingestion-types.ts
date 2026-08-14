import type {
  GpsIngestionRequest,
  GpsIngestionResponse,
} from "@valet/contracts";

export type GpsSampleInput = GpsIngestionRequest["samples"][number];
export type GpsSampleResult = GpsIngestionResponse["samples"][number];

export interface GpsIngestionCommandRequest {
  readonly authenticatedUserId: string;
  readonly samples: readonly GpsSampleInput[];
  readonly sessionId: string;
}

export interface LockedGpsSession {
  readonly id: string;
  readonly location_id: string;
  readonly organization_id: string;
  readonly state: string;
}

export interface LockedGpsTask {
  readonly current_assignee_membership_id: string | null;
  readonly id: string;
  readonly status: string;
  readonly task_type: string;
}

export interface LockedTrackingSession {
  readonly id: string;
  readonly started_at: Date;
}

export interface CanonicalGpsSample {
  readonly capturedAt: Date;
  readonly clientSampleId: string;
  readonly latitude: string;
  readonly longitude: string;
  readonly ordinal: number;
}

export interface PersistedGpsBatch {
  readonly acceptedSamples: readonly CanonicalGpsSample[];
  readonly results: readonly GpsSampleResult[];
}
