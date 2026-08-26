import {
  createLatestRequestGate,
  type LatestRequestGate,
  type LatestRequestSnapshot,
} from "../../lib/api/latest-request-gate";

import { loadReport } from "./reports-api";
import type { ReportsClient, ReportResponse } from "./reports-api";

/**
 * Framework-free loader for the Reports page.
 *
 * Wraps the shared latest-request-wins gate with the report read so
 * LOCATION, KIND and PERIOD race rules are explicit and unit-testable:
 * - request identity is (locationId, kind, periodValue): selecting another
 *   location, kind or period supersedes every earlier request;
 * - the snapshot clears synchronously on each new identity, so stale facts
 *   from Location A / DAILY / P1 can never render under B / WEEKLY / P2;
 * - retry re-runs exactly the last requested identity.
 */
export interface ReportsLoader {
  load: (request: {
    readonly locationId: string;
    readonly kind: ReportResponse["kind"];
    readonly periodValue: string;
  }) => void;
  retry: () => void;
  dispose: () => void;
}

export function createReportsLoader(options: {
  client: ReportsClient;
  onChange: (snapshot: LatestRequestSnapshot<ReportResponse>) => void;
}): ReportsLoader {
  const gate: LatestRequestGate = createLatestRequestGate<ReportResponse>({
    fetcher: (identity, signal) =>
      loadReport(
        options.client,
        {
          kind: (identity[1] ?? "DAILY") as ReportResponse["kind"],
          locationId: identity[0] ?? "",
          periodValue: identity[2] ?? "",
        },
        signal,
      ),
    onChange: options.onChange,
    unexpectedErrorCode: "REPORTS_UNEXPECTED_ERROR",
  });
  return {
    load: (request): void =>
      gate.load([request.locationId, request.kind, request.periodValue]),
    retry: (): void => gate.retry(),
    dispose: (): void => gate.dispose(),
  };
}
