"use client";

import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";
import { OverviewPage } from "../../features/intelligence/overview-page";

export default function OverviewRoute() {
  return (
    <ProtectedDashboardRoute accessRequirement="MANAGEMENT_INTELLIGENCE">
      <OverviewPage />
    </ProtectedDashboardRoute>
  );
}
