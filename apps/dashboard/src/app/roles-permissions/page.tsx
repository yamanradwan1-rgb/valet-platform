import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";
import { RolesPage } from "../../features/administration/roles/roles-page";

export default function RolesPermissionsRoute() {
  return <ProtectedDashboardRoute accessRequirement="DASHBOARD"><RolesPage /></ProtectedDashboardRoute>;
}
