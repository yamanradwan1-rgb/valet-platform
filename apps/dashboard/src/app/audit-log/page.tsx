import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";
import { AuditPage } from "../../features/audit";

export default function AuditLogRoute() {
  return (
    <ProtectedDashboardRoute accessRequirement="MANAGEMENT_AUDIT">
      <AuditPage />
    </ProtectedDashboardRoute>
  );
}
