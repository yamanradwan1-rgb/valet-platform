"use client";

import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";
import { PaymentsPage } from "../../features/intelligence/payments-page";

export default function PaymentsRoute() {
  return (
    <ProtectedDashboardRoute accessRequirement="MANAGEMENT_INTELLIGENCE">
      <PaymentsPage />
    </ProtectedDashboardRoute>
  );
}
