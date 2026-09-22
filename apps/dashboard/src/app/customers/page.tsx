import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";
import { VisitContactsPage } from "../../features/visit-contacts";

export default function CustomersRoute() {
  return (
    <ProtectedDashboardRoute accessRequirement="VISIT_CONTACTS">
      <VisitContactsPage />
    </ProtectedDashboardRoute>
  );
}
