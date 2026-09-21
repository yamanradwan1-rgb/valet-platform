import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";
import { LocationsPage } from "../../features/administration/locations/locations-page";

export default function LocationsRoute() {
  return <ProtectedDashboardRoute accessRequirement="DASHBOARD"><LocationsPage /></ProtectedDashboardRoute>;
}
