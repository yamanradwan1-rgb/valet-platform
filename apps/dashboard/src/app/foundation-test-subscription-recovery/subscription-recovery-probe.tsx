"use client";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";

export function SubscriptionRecoveryProbe() {
  const { selectedScope } = useProtectedDashboard();
  const organizationId =
    selectedScope.authority === "COMPANY_ADMIN"
      ? selectedScope.context.organization.organizationId
      : selectedScope.authority === "SUPERVISOR"
        ? selectedScope.context.organization.organizationId
        : selectedScope.organization.organizationId;

  return (
    <div className="stack">
      <h1>Subscription recovery fixture</h1>
      <p data-testid="recovery-authority">{selectedScope.authority}</p>
      <p data-testid="recovery-organization">{organizationId}</p>
    </div>
  );
}
