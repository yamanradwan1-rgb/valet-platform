import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";
import { IncidentsPage } from "../../features/operations/incidents/incidents-page";

export default function IncidentsRoute() {
  return <ProtectedDashboardRoute accessRequirement="DASHBOARD"><IncidentsPage /></ProtectedDashboardRoute>;
}
