import type { LocationSubscriptionResponse } from "@valet/contracts";

import {
  createLatestRequestGate,
  type LatestRequestGate,
  type LatestRequestSnapshot,
} from "../../lib/api/latest-request-gate";

import { fetchLocationSubscription } from "./subscription-api";
import type { SubscriptionClient } from "./subscription-api";

/**
 * Framework-free loader for the /subscription page (D4-004).
 *
 * Wraps the shared latest-request-wins gate with the subscription endpoint
 * so LOCATION IDENTITY race rules are explicit and unit-testable:
 * - `load(locationId)` is the only way request identity changes; it aborts
 *   the in-flight request and clears the snapshot synchronously;
 * - a late Location A response can never surface after Location B was
 *   loaded (enforced by the gate's sequence check) — A's planCode or
 *   organizationId can never render under B;
 * - retry re-runs exactly the last requested location.
 */
export interface SubscriptionLoader {
  load: (locationId: string) => void;
  retry: () => void;
  dispose: () => void;
}

export function createSubscriptionLoader(options: {
  client: SubscriptionClient;
  onChange: (
    snapshot: LatestRequestSnapshot<LocationSubscriptionResponse>,
  ) => void;
}): SubscriptionLoader {
  const gate: LatestRequestGate =
    createLatestRequestGate<LocationSubscriptionResponse>({
      fetcher: (identity, signal) =>
        fetchLocationSubscription(
          options.client,
          identity[0] ?? "",
          signal,
        ),
      onChange: options.onChange,
      unexpectedErrorCode: "SUBSCRIPTION_UNEXPECTED_ERROR",
    });
  return {
    load: (locationId: string): void => gate.load([locationId]),
    retry: (): void => gate.retry(),
    dispose: (): void => gate.dispose(),
  };
}
