import type { LiveOperationsItem } from "./live-operations-api";
import {
  createLiveOperationsController,
  type LiveOperationsFetcherParams,
  type LiveOperationsPageData,
  type LiveOperationsSnapshot,
} from "./live-operations-controller";

/**
 * Focused shared setup for the live operations controller suites.
 * Contains no assertions — only deterministic request/response plumbing.
 */
export const LOCATION_A = "11111111-1111-4111-8111-111111111111";
export const LOCATION_B = "22222222-2222-4222-8222-222222222222";

export function trackerItem(trackingSessionId: string): LiveOperationsItem {
  return {
    assigneeMembershipId: "eb39db89-54d2-45fa-a64e-29f89688f102",
    position: null,
    sessionState: "PARKING",
    taskId: "59220eb7-d188-4c7f-ab9e-a4779a6af101",
    taskType: "PARKING",
    trackingSessionId,
    valetSessionId: "2dc14878-df98-4d0f-b164-bc2506a6b102",
    vehicle: {
      color: null,
      make: null,
      model: null,
      plateCountry: null,
      plateNumber: "34-B-7890",
      temporaryDescriptor: null,
      vehicleId: "6225b06f-d0fd-4c02-a59c-b0388094b102",
    },
  };
}

export function page(
  ids: string[],
  nextCursor: string | null,
  observedAt: string,
): LiveOperationsPageData {
  return {
    items: ids.map(trackerItem),
    nextCursor,
    observedAt,
  };
}

export interface PendingRequest {
  readonly params: LiveOperationsFetcherParams;
  readonly signal: AbortSignal;
  resolve(pageData: LiveOperationsPageData): void;
  reject(error: unknown): void;
}

export class FetchHarness {
  readonly snapshots: LiveOperationsSnapshot[] = [];
  readonly fetches: PendingRequest[] = [];
  readonly controller: ReturnType<typeof createLiveOperationsController>;

  constructor() {
    this.controller = createLiveOperationsController({
      fetcher: (params) => this.fetch(params),
      onChange: (snapshot) => {
        this.snapshots.push(snapshot);
      },
    });
  }

  get latest(): LiveOperationsSnapshot {
    return this.snapshots[this.snapshots.length - 1]!;
  }

  private fetch(
    params: LiveOperationsFetcherParams,
  ): Promise<LiveOperationsPageData> {
    // The controller owns the AbortController; its signal is what a real
    // fetcher hands to StaffApiClient, so aborts surface here verbatim.
    return new Promise<LiveOperationsPageData>((resolve, reject) => {
      this.fetches.push({ params, signal: params.signal, resolve, reject });
    });
  }
}
