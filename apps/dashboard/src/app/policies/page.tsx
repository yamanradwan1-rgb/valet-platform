import { ProtectedDashboardRoute } from "../../components/foundation/protected-dashboard-route";
import { SettingsPage } from "../../features/administration/settings/settings-page";

export default function PoliciesRoute() {
  return <ProtectedDashboardRoute accessRequirement="DASHBOARD"><SettingsPage /></ProtectedDashboardRoute>;
}
