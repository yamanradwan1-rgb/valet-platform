import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";
import { LiveOperationsPage } from "../../features/operations/live-operations/live-operations-page";

export default function LiveOperationsRoute() {
  return <ProtectedDashboardRoute accessRequirement="DASHBOARD"><LiveOperationsPage /></ProtectedDashboardRoute>;
}
