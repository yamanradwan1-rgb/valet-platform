import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";
import { MapsPage } from "../../features/operations/maps/maps-page";

export default function MapsZonesRoute() {
  return <ProtectedDashboardRoute accessRequirement="LOCATION_MAPS"><MapsPage /></ProtectedDashboardRoute>;
}
