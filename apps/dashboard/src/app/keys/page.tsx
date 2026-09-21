import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";
import { KeysPage } from "../../features/operations/keys/keys-page";

export default function KeysRoute() {
  return <ProtectedDashboardRoute accessRequirement="DASHBOARD"><KeysPage /></ProtectedDashboardRoute>;
}
