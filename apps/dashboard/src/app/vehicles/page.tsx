import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";
import { VehiclesPage } from "../../features/operations/vehicles/vehicles-page";

export default function VehiclesRoute() {
  return <ProtectedDashboardRoute accessRequirement="DASHBOARD"><VehiclesPage /></ProtectedDashboardRoute>;
}
