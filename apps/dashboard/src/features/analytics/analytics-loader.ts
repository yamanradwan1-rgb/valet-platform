import {
  createLatestRequestGate,
  type LatestRequestGate,
  type LatestRequestSnapshot,
} from "../../lib/api/latest-request-gate";

import { loadAnalyticsComposition } from "./analytics-api";
import type { AnalyticsClient, AnalyticsComposition } from "./analytics-api";

/**
 * Framework-free loader for the Analytics page.
 *
 * Wraps the shared latest-request-wins gate with the analytics composition
 * so LOCATION AND PERIOD race rules are explicit and unit-testable:
 * - request identity is (locationId, from, to): selecting another location,
 *   applying another period, or both supersedes every earlier request;
 * - the snapshot clears synchronously on each new identity, so stale facts
 *   from Location A / period P1 can never render under B / P2;
 * - retry re-runs exactly the last requested (location, period).
 */
export interface AnalyticsLoader {
  load: (request: {
    readonly locationId: string;
    readonly from: string;
    readonly to: string;
  }) => void;
  retry: () => void;
  dispose: () => void;
}

export function createAnalyticsLoader(options: {
  client: AnalyticsClient;
  onChange: (snapshot: LatestRequestSnapshot<AnalyticsComposition>) => void;
}): AnalyticsLoader {
  const gate: LatestRequestGate = createLatestRequestGate<AnalyticsComposition>(
    {
      fetcher: (identity, signal) =>
        loadAnalyticsComposition(
          options.client,
          identity[0] ?? "",
          identity[1] ?? "",
          identity[2] ?? "",
          signal,
        ),
      onChange: options.onChange,
      unexpectedErrorCode: "ANALYTICS_UNEXPECTED_ERROR",
    },
  );
  return {
    load: (request: {
      readonly locationId: string;
      readonly from: string;
      readonly to: string;
    }): void => gate.load([request.locationId, request.from, request.to]),
    retry: (): void => gate.retry(),
    dispose: (): void => gate.dispose(),
  };
}
