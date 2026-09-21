import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";
import { IntegrationsPage } from "../../features/administration/commercial/integrations-page";

export default function IntegrationsRoute() {
  return <ProtectedDashboardRoute accessRequirement="DASHBOARD"><IntegrationsPage /></ProtectedDashboardRoute>;
}
