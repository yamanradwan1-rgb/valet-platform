"use client";

import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";
import { AnalyticsPage } from "../../features/intelligence/analytics-page";

export default function AnalyticsRoute() {
  return (
    <ProtectedDashboardRoute accessRequirement="MANAGEMENT_INTELLIGENCE">
      <AnalyticsPage />
    </ProtectedDashboardRoute>
  );
}
