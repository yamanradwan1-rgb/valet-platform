"use client";

import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";
import { ReportsPage } from "../../features/intelligence/reports-page";

export default function ReportsRoute() {
  return (
    <ProtectedDashboardRoute accessRequirement="MANAGEMENT_INTELLIGENCE">
      <ReportsPage />
    </ProtectedDashboardRoute>
  );
}
