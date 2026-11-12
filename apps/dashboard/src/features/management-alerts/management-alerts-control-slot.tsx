import type { ReactNode } from "react";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import type { SelectedDashboardScope } from "../../components/scope";
import { ManagementAlertsControl } from "./management-alerts-control";

interface ManagementAlertsControlSlotInput {
  readonly api: DashboardApiClient;
  readonly authorized: boolean;
  readonly controlKey: string;
  readonly override?: ReactNode;
  readonly selectionRevision: number;
  readonly selectedScope: SelectedDashboardScope;
}

export function resolveManagementAlertsControl({
  api,
  authorized,
  controlKey,
  override,
  selectionRevision,
  selectedScope,
}: ManagementAlertsControlSlotInput): ReactNode {
  if (override !== undefined) return override;
  return (
    <ManagementAlertsControl
      key={controlKey}
      api={api}
      authorized={authorized}
      selectionRevision={selectionRevision}
      selectedScope={selectedScope}
    />
  );
}
