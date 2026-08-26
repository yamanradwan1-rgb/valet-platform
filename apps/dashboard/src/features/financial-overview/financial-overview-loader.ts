import type { FinancialOverviewResponse } from "@valet/contracts";

import {
  createLatestRequestGate,
  type LatestRequestGate,
  type LatestRequestSnapshot,
} from "../../lib/api/latest-request-gate";

import { fetchLocationFinancialOverview } from "./financial-overview-api";
import type { FinancialOverviewClient } from "./financial-overview-api";

/**
 * Framework-free loader for the Financial Overview page.
 *
 * Wraps the shared latest-request-wins gate with the financial endpoint so
 * LOCATION IDENTITY race rules are explicit and unit-testable:
 * - `load(locationId)` is the only way request identity changes; it aborts
 *   the in-flight request and clears the snapshot synchronously;
 * - a late Location A response can never surface after Location B was
 *   loaded (enforced by the gate's sequence check);
 * - retry re-runs exactly the last requested location.
 */
export interface FinancialOverviewLoader {
  load: (locationId: string) => void;
  retry: () => void;
  dispose: () => void;
}

export function createFinancialOverviewLoader(options: {
  client: FinancialOverviewClient;
  onChange: (snapshot: LatestRequestSnapshot<FinancialOverviewResponse>) => void;
}): FinancialOverviewLoader {
  const gate: LatestRequestGate = createLatestRequestGate<FinancialOverviewResponse>(
    {
      fetcher: (identity, signal) =>
        fetchLocationFinancialOverview(
          options.client,
          identity[0] ?? "",
          signal,
        ),
      onChange: options.onChange,
      unexpectedErrorCode: "FINANCIAL_OVERVIEW_UNEXPECTED_ERROR",
    },
  );
  return {
    load: (locationId: string): void => gate.load([locationId]),
    retry: (): void => gate.retry(),
    dispose: (): void => gate.dispose(),
  };
}
